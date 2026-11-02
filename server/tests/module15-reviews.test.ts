import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import app from "../src/app";
import { User } from "../src/modules/auth/user.model";
import { Address } from "../src/modules/addresses/address.model";
import { Product } from "../src/modules/products/product.model";
import { Order, OrderStatus } from "../src/modules/orders/order.model";
import { Review } from "../src/modules/reviews/review.model";
import { ReviewStatus } from "../src/modules/reviews/review.types";

test(
  "Module 15: Product Reviews - 20 Test Scenarios",
  { timeout: 300000 },
  async (t) => {
    const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = mongo.getUri("module15_reviews_test");
    process.env.JWT_ACCESS_SECRET = "module15-reviews-test-secret";

    await mongoose.connect(uri);
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;

    // Users: 0: Customer A, 1: Customer B, 2: Staff, 3: Admin
    const users = await User.create(
      ["CUSTOMER", "CUSTOMER", "STAFF", "ADMIN"].map((role, i) => ({
        fullName: `User-Rev-${role}-${i}`,
        email: `m15-${i}@test.local`,
        passwordHash: "unused",
        role,
      })),
    );

    const tokens = users.map((u) =>
      jwt.sign({ role: u.role }, process.env.JWT_ACCESS_SECRET!, {
        subject: u.id,
      }),
    );

    const addresses = await Address.create(
      users.slice(0, 2).map((u, i) => ({
        userId: u._id,
        fullName: `Customer Rev ${i}`,
        phone: "0901234567",
        province: "Ha Noi",
        ward: "Thach That",
        detail: `So ${i + 1} Pho Review`,
      })),
    );

    let seq = 0;
    const api = async (
      path: string,
      userIndex?: number,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) => {
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...headers,
      };
      if (userIndex !== undefined && tokens[userIndex]) {
        reqHeaders.Authorization = `Bearer ${tokens[userIndex]}`;
      }

      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method,
        headers: reqHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let resBody: any = null;
      const text = await res.text();
      try {
        resBody = JSON.parse(text);
      } catch {
        resBody = text;
      }

      return { status: res.status, body: resBody };
    };

    const createDeliveredOrder = async (userIndex: number, productDoc: any) => {
      const order = await Order.create({
        userId: users[userIndex]._id,
        items: [
          {
            productId: productDoc._id,
            name: productDoc.name,
            sku: productDoc.sku,
            price: productDoc.price,
            quantity: 1,
            subtotal: productDoc.price,
          },
        ],
        totalQuantity: 1,
        totalAmount: productDoc.price,
        shippingAddress: {
          fullName: addresses[userIndex].fullName,
          phone: addresses[userIndex].phone,
          province: addresses[userIndex].province,
          ward: addresses[userIndex].ward,
          detail: addresses[userIndex].detail,
        },
        status: OrderStatus.DELIVERED,
        paymentMethod: "COD",
      });

      return order;
    };

    try {
      // Setup Product 1
      const product1 = await Product.create({
        name: `Laptop Review Test-${++seq}`,
        sku: `SKU-REV-${seq}`,
        price: 20000000,
        stock: 10,
      });

      // 1. Tạo đánh giá cho sản phẩm đã nhận hàng (201)
      let review1Id: string;
      await t.test("01. Tạo đánh giá cho sản phẩm đã nhận hàng", async () => {
        await createDeliveredOrder(0, product1);

        const res = await api("/reviews", 0, "POST", {
          productId: product1.id,
          rating: 5,
          title: "San pham rat tot",
          comment: "May dung rat muot ma, pin trau, man hinh sac net.",
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.data.rating, 5);
        assert.equal(res.body.data.title, "San pham rat tot");
        assert.equal(res.body.data.verifiedPurchase, true);
        assert.equal(res.body.data.status, ReviewStatus.VISIBLE);
        review1Id = res.body.data._id;
      });

      // 2. Từ chối đánh giá khi chưa có đơn DELIVERED (403)
      await t.test(
        "02. Từ chối đánh giá khi chưa có đơn DELIVERED",
        async () => {
          // Customer B has NOT purchased product 1
          const res = await api("/reviews", 1, "POST", {
            productId: product1.id,
            rating: 4,
            title: "Chua mua nhung muon danh gia",
            comment: "Toi chua mua hang nhung thay quang cao hay.",
          });
          assert.equal(res.status, 403);
        },
      );

      // 3. Từ chối đánh giá trùng sản phẩm (409)
      await t.test("03. Từ chối đánh giá trùng sản phẩm", async () => {
        // Customer A already reviewed product 1 in test 01
        const res = await api("/reviews", 0, "POST", {
          productId: product1.id,
          rating: 4,
          title: "Danh gia lan hai",
          comment: "Toi muon viet them mot danh gia nua cho may nay.",
        });
        assert.equal(res.status, 409);
      });

      // 4. Từ chối rating ngoài khoảng 1–5 (400)
      await t.test("04. Từ chối rating ngoài khoảng 1–5", async () => {
        const product2 = await Product.create({
          name: `Chuot Review-${++seq}`,
          sku: `SKU-REV-${seq}`,
          price: 500000,
          stock: 10,
        });
        await createDeliveredOrder(0, product2);

        for (const invalidRating of [0, 6, -1, 4.5, "5"]) {
          const res = await api("/reviews", 0, "POST", {
            productId: product2.id,
            rating: invalidRating,
            title: "Chuot dung tot",
            comment: "Chuot go rat em va nhay khong bi delay.",
          });
          assert.equal(res.status, 400);
        }
      });

      // 5. Từ chối tiêu đề hoặc nội dung không hợp lệ (400)
      await t.test(
        "05. Từ chối tiêu đề hoặc nội dung không hợp lệ",
        async () => {
          const product3 = await Product.create({
            name: `Ban phim Review-${++seq}`,
            sku: `SKU-REV-${seq}`,
            price: 800000,
            stock: 10,
          });
          await createDeliveredOrder(0, product3);

          // Title too short (< 3 chars)
          const resShortTitle = await api("/reviews", 0, "POST", {
            productId: product3.id,
            rating: 5,
            title: "Ok",
            comment: "Ban phim co dung rat tot va em tay.",
          });
          assert.equal(resShortTitle.status, 400);

          // Comment too short (< 10 chars)
          const resShortComment = await api("/reviews", 0, "POST", {
            productId: product3.id,
            rating: 5,
            title: "Ban phim tot",
            comment: "Ngan qua",
          });
          assert.equal(resShortComment.status, 400);

          // Empty title / comment
          const resEmpty = await api("/reviews", 0, "POST", {
            productId: product3.id,
            rating: 5,
            title: "   ",
            comment: "   ",
          });
          assert.equal(resEmpty.status, 400);
        },
      );

      // 6. Danh sách đánh giá công khai và phân trang (200)
      await t.test(
        "06. Danh sách đánh giá công khai và phân trang",
        async () => {
          // Public request without token
          const res = await api(
            `/reviews/products/${product1.id}?page=1&limit=10`,
          );
          assert.equal(res.status, 200);
          assert.ok(Array.isArray(res.body.data.items));
          assert.equal(res.body.data.items.length, 1);
          assert.equal(res.body.data.pagination.page, 1);
          assert.equal(res.body.data.pagination.limit, 10);
          assert.equal(res.body.data.pagination.total, 1);
          // Public review does not leak userId
          assert.equal(res.body.data.items[0].userId, undefined);
        },
      );

      // 7. Tính đúng điểm trung bình và phân bố số sao (200)
      await t.test(
        "07. Tính đúng điểm trung bình và phân bố số sao",
        async () => {
          // Customer B purchases product1 and reviews with rating 3
          await createDeliveredOrder(1, product1);
          const resB = await api("/reviews", 1, "POST", {
            productId: product1.id,
            rating: 3,
            title: "May tam on trong tam gia",
            comment: "May hoi nong khi choi game nhung van dung duoc.",
          });
          assert.equal(resB.status, 201);

          // Summary: review 1 is 5 stars, review 2 is 3 stars -> average = (5+3)/2 = 4.0, total = 2
          const resSummary = await api(
            `/reviews/products/${product1.id}/summary`,
          );
          assert.equal(resSummary.status, 200);
          assert.equal(resSummary.body.data.totalReviews, 2);
          assert.equal(resSummary.body.data.averageRating, 4);
          assert.equal(resSummary.body.data.distribution["5"], 1);
          assert.equal(resSummary.body.data.distribution["3"], 1);
          assert.equal(resSummary.body.data.distribution["1"], 0);
        },
      );

      // 8. Khách hàng xem lịch sử đánh giá của mình (200)
      await t.test("08. Khách hàng xem lịch sử đánh giá của mình", async () => {
        const res = await api("/reviews/me?page=1&limit=5", 0, "GET");
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.data.items));
        assert.ok(res.body.data.items.length >= 1);
        assert.equal(res.body.data.items[0]._id, review1Id);
      });

      // 9. Khách hàng sửa đánh giá của mình (200)
      await t.test("09. Khách hàng sửa đánh giá của mình", async () => {
        const res = await api(`/reviews/${review1Id}`, 0, "PATCH", {
          rating: 4,
          title: "Cap nhat sau 1 tuan su dung",
          comment: "May van rat on dinh, chi co sac hoi to mot chut.",
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.rating, 4);
        assert.equal(res.body.data.title, "Cap nhat sau 1 tuan su dung");
      });

      // 10. Không thể sửa đánh giá của người khác (404)
      await t.test("10. Không thể sửa đánh giá của người khác", async () => {
        // Customer B attempts to edit review1Id (owned by Customer A)
        const res = await api(`/reviews/${review1Id}`, 1, "PATCH", {
          rating: 1,
          title: "Hack danh gia nguoi khac",
          comment: "Thu xem co sua duoc danh gia cua nguoi khac khong.",
        });
        assert.equal(res.status, 404);
      });

      // 11. Xóa mềm và không hiển thị công khai (200)
      let reviewSoftDeletedId: string;
      await t.test("11. Xóa mềm và không hiển thị công khai", async () => {
        const productDel = await Product.create({
          name: `Tai nghe-${++seq}`,
          sku: `SKU-REV-${seq}`,
          price: 1200000,
          stock: 5,
        });
        await createDeliveredOrder(0, productDel);

        const createRes = await api("/reviews", 0, "POST", {
          productId: productDel.id,
          rating: 5,
          title: "Tai nghe rat hay",
          comment: "Am bass chac, nghe rat da tai, cach am tot.",
        });
        reviewSoftDeletedId = createRes.body.data._id;

        // Soft delete
        const delRes = await api(
          `/reviews/${reviewSoftDeletedId}`,
          0,
          "DELETE",
        );
        assert.equal(delRes.status, 200);
        assert.equal(delRes.body.data.deleted, true);

        // Public product reviews should not show it
        const publicList = await api(`/reviews/products/${productDel.id}`);
        assert.equal(publicList.body.data.items.length, 0);
        assert.equal(publicList.body.data.pagination.total, 0);
      });

      // 12. Không cho sửa đánh giá đã xóa (409)
      await t.test("12. Không cho sửa đánh giá đã xóa", async () => {
        const res = await api(`/reviews/${reviewSoftDeletedId}`, 0, "PATCH", {
          rating: 5,
          title: "Sua danh gia da bi xoa",
          comment: "Thu sua danh gia sau khi da delete mem.",
        });
        assert.equal(res.status, 409);
      });

      // 13. STAFF/ADMIN ẩn đánh giá (200)
      await t.test("13. STAFF/ADMIN ẩn đánh giá", async () => {
        // review1Id is currently VISIBLE. Staff hides it.
        const res = await api(
          `/admin/reviews/${review1Id}/moderation`,
          2,
          "PATCH",
          {
            status: ReviewStatus.HIDDEN,
          },
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.data.status, ReviewStatus.HIDDEN);

        // Verify it disappeared from public list
        const publicRes = await api(`/reviews/products/${product1.id}`);
        // Only review 2 (from customer B) remains visible
        assert.equal(publicRes.body.data.items.length, 1);
        assert.notEqual(publicRes.body.data.items[0]._id, review1Id);
      });

      // 14. STAFF/ADMIN khôi phục đánh giá bị ẩn (200)
      await t.test("14. STAFF/ADMIN khôi phục đánh giá bị ẩn", async () => {
        const res = await api(
          `/admin/reviews/${review1Id}/moderation`,
          2,
          "PATCH",
          {
            status: ReviewStatus.VISIBLE,
          },
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.data.status, ReviewStatus.VISIBLE);

        // Verify it reappeared in public list
        const publicRes = await api(`/reviews/products/${product1.id}`);
        assert.equal(publicRes.body.data.items.length, 2);
      });

      // 15. Không cho khôi phục đánh giá đã xóa (409)
      await t.test("15. Không cho khôi phục đánh giá đã xóa", async () => {
        const res = await api(
          `/admin/reviews/${reviewSoftDeletedId}/moderation`,
          2,
          "PATCH",
          {
            status: ReviewStatus.VISIBLE,
          },
        );
        assert.equal(res.status, 409);
      });

      // 16. CUSTOMER không truy cập API quản trị (403)
      await t.test("16. CUSTOMER không truy cập API quản trị", async () => {
        // Customer tries to list all reviews for moderation
        const resList = await api("/admin/reviews", 0, "GET");
        assert.equal(resList.status, 403);

        // Customer tries to moderate a review
        const resMod = await api(
          `/admin/reviews/${review1Id}/moderation`,
          0,
          "PATCH",
          {
            status: ReviewStatus.HIDDEN,
          },
        );
        assert.equal(resMod.status, 403);
      });

      // 17. Yêu cầu chưa đăng nhập bị từ chối ở API bảo vệ (401)
      await t.test(
        "17. Yêu cầu chưa đăng nhập bị từ chối ở API bảo vệ",
        async () => {
          const res1 = await api("/reviews/me", undefined, "GET");
          assert.equal(res1.status, 401);

          const res2 = await api("/reviews", undefined, "POST", {
            productId: product1.id,
            rating: 5,
            title: "Test",
            comment: "Chua dang nhap",
          });
          assert.equal(res2.status, 401);

          const res3 = await api("/admin/reviews", undefined, "GET");
          assert.equal(res3.status, 401);
        },
      );

      // 18. Hai yêu cầu tạo cùng đánh giá đồng thời không tạo trùng
      await t.test(
        "18. Hai yêu cầu tạo cùng đánh giá đồng thời không tạo trùng",
        async () => {
          const productRace = await Product.create({
            name: `May in Race-${++seq}`,
            sku: `SKU-REV-${seq}`,
            price: 3000000,
            stock: 5,
          });
          await createDeliveredOrder(0, productRace);

          const [resA, resB] = await Promise.all([
            api("/reviews", 0, "POST", {
              productId: productRace.id,
              rating: 5,
              title: "May in rat dep A",
              comment: "Chat luong in sac net, muc deu mau va tiet kiem.",
            }),
            api("/reviews", 0, "POST", {
              productId: productRace.id,
              rating: 4,
              title: "May in rat dep B",
              comment: "Chat luong in sac net, muc deu mau va tiet kiem.",
            }),
          ]);

          const statuses = [resA.status, resB.status].sort();
          assert.deepEqual(statuses, [201, 409]);

          // Exactly 1 review created in DB
          const count = await Review.countDocuments({
            userId: users[0]._id,
            productId: productRace._id,
          });
          assert.equal(count, 1);
        },
      );

      // 19. Hai yêu cầu cập nhật cùng phiên bản không ghi đè nhau (409)
      await t.test(
        "19. Hai yêu cầu cập nhật cùng phiên bản không ghi đè nhau",
        async () => {
          const [resA, resB] = await Promise.all([
            api(`/reviews/${review1Id}`, 0, "PATCH", {
              rating: 5,
              title: "Cap nhat dong thoi nhanh A",
              comment: "Noi dung cap nhat tu tien trinh A hoan toan hop le.",
            }),
            api(`/reviews/${review1Id}`, 0, "PATCH", {
              rating: 3,
              title: "Cap nhat dong thoi nhanh B",
              comment: "Noi dung cap nhat tu tien trinh B hoan toan hop le.",
            }),
          ]);

          const statuses = [resA.status, resB.status].sort();
          assert.deepEqual(statuses, [200, 409]);
        },
      );

      // 20. Tính lại điểm trung bình sau khi ẩn/xóa
      await t.test("20. Tính lại điểm trung bình sau khi ẩn/xóa", async () => {
        // product1 has 2 reviews:
        // Review 1 (A): edited to 5 stars in test 19 (the winner of race). Let's verify rating.
        // Review 2 (B): rating 3.
        // Now hide Review 1 -> Summary must reflect only Review 2 (rating 3, total 1)
        await api(`/admin/reviews/${review1Id}/moderation`, 2, "PATCH", {
          status: ReviewStatus.HIDDEN,
        });

        const summaryHidden = await api(
          `/reviews/products/${product1.id}/summary`,
        );
        assert.equal(summaryHidden.status, 200);
        assert.equal(summaryHidden.body.data.totalReviews, 1);
        assert.equal(summaryHidden.body.data.averageRating, 3);
        assert.equal(summaryHidden.body.data.distribution["3"], 1);
        assert.equal(summaryHidden.body.data.distribution["5"], 0);

        // Restore Review 1
        await api(`/admin/reviews/${review1Id}/moderation`, 2, "PATCH", {
          status: ReviewStatus.VISIBLE,
        });

        // Now Customer B deletes their review (Review 2)
        // Find review 2 ID
        const rev2 = await Review.findOne({
          userId: users[1]._id,
          productId: product1._id,
        });
        assert.ok(rev2);
        await api(`/reviews/${rev2!._id}`, 1, "DELETE");

        const summaryDeleted = await api(
          `/reviews/products/${product1.id}/summary`,
        );
        assert.equal(summaryDeleted.status, 200);
        assert.equal(summaryDeleted.body.data.totalReviews, 1);
        assert.equal(summaryDeleted.body.data.averageRating, 5);
        assert.equal(summaryDeleted.body.data.distribution["5"], 1);
        assert.equal(summaryDeleted.body.data.distribution["3"], 0);
      });
    } finally {
      server.close();
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);

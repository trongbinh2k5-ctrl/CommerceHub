import { Link } from 'react-router-dom';
import { PageHeading } from './components';

export function ShoppingHelp() {
  return <div className="shell information-page shopping-help">
    <PageHeading kicker="BC / HỖ TRỢ MUA SẮM" title="Hướng dẫn mua hàng"/>
    <p className="muted">Từ chọn thiết bị đến theo dõi đơn và hỗ trợ sau mua.</p>
    <nav className="help-shortcuts" aria-label="Nội dung hướng dẫn">
      <a className="text-link" href="#buying-steps">Cách đặt hàng</a>
      <a className="text-link" href="#shopping-questions">Câu hỏi thường gặp</a>
      <Link className="text-link" to="/contact">Liên hệ cửa hàng</Link>
    </nav>
    <section id="buying-steps" aria-labelledby="buying-title">
      <h2 id="buying-title">Đặt hàng trong 4 bước</h2>
      <ol className="help-steps">
        <li><h3>Chọn thiết bị</h3><p><Link to="/products">Tìm sản phẩm</Link>, mở trang chi tiết để xem giá, tồn kho, phiên bản và thông số. Với thông tin chưa cập nhật, hãy liên hệ cửa hàng để xác nhận trước khi mua.</p></li>
        <li><h3>Đăng nhập và thêm vào giỏ</h3><p><Link to="/login">Đăng nhập</Link> bằng tài khoản khách hàng hoặc <Link to="/register">đăng ký tài khoản</Link>. Chọn số lượng và thêm sản phẩm còn hàng vào giỏ.</p></li>
        <li><h3>Kiểm tra và xác nhận</h3><p>Mở <Link to="/cart">giỏ hàng</Link>, tiến hành đặt hàng, chọn địa chỉ nhận và áp dụng mã giảm giá nếu có. Kiểm tra tiền hàng, phí giao hàng và tổng thanh toán trước khi xác nhận.</p></li>
        <li><h3>Theo dõi đơn hàng</h3><p>Vào <Link to="/account?tab=orders">tài khoản</Link> để mở chi tiết đơn, xem trạng thái thanh toán, xử lý và giao hàng.</p></li>
      </ol>
    </section>
    <section id="shopping-questions" aria-labelledby="questions-title">
      <h2 id="questions-title">Câu hỏi thường gặp</h2>
      <div className="help-questions">
        <details><summary>Tôi có thể thanh toán bằng những cách nào?</summary><p>COD hoặc SePay khi cửa hàng đã bật. Kiểm tra phương thức và số tiền trước khi thanh toán.</p></details>
        <details><summary>Phí giao hàng và thời gian nhận hàng như thế nào?</summary><p>Phí được hiển thị trong bước xác nhận đơn hàng. Xem <Link to="/policies/shipping">chính sách giao hàng</Link> để biết thông tin cửa hàng công bố. Nếu chính sách hoặc thời gian giao chưa cập nhật, hãy <Link to="/contact">liên hệ cửa hàng</Link> để xác nhận.</p></details>
        <details><summary>Tôi có thể hủy đơn sau khi đặt không?</summary><p>Mở đơn trong <Link to="/account?tab=orders">tài khoản</Link>. Có thể hủy trước khi bàn giao vận chuyển. Tiền đã thanh toán được xử lý hoàn riêng; theo dõi trạng thái trong đơn hàng.</p></details>
        <details><summary>Tôi gửi yêu cầu đổi trả hoặc bảo hành ở đâu?</summary><p>Với đơn đã giao, mở chi tiết đơn và chọn “Yêu cầu đổi trả / bảo hành”. Chọn sản phẩm và mô tả vấn đề; theo dõi phản hồi trong tài khoản. Việc tiếp nhận yêu cầu chưa đồng nghĩa với chấp thuận đổi trả hoặc hoàn tiền. Xem <Link to="/policies/returns">chính sách đổi trả</Link> và <Link to="/policies/warranty">bảo hành</Link> trước khi gửi.</p></details>
        <details><summary>Quên mật khẩu hoặc không nhận được email thì làm gì?</summary><p>Mở trang <Link to="/forgot-password">quên mật khẩu</Link> và làm theo hướng dẫn. Nếu dịch vụ gửi email chưa được kết nối, trang sẽ thông báo rõ; lúc đó hãy liên hệ cửa hàng. Không cung cấp mật khẩu hay liên kết khôi phục cho người khác.</p></details>
        <details><summary>Giá hoặc tồn kho thay đổi khi đặt hàng thì sao?</summary><p>Hệ thống kiểm tra lại giá và tồn kho khi xác nhận. Nếu tổng tiền thay đổi, hãy kiểm tra lại trước khi xác nhận; nếu không đủ hàng, điều chỉnh số lượng trong giỏ. Thêm vào giỏ chưa giữ hàng.</p></details>
      </div>
    </section>
    <p className="help-contact">Bạn cần thêm thông tin? <Link to="/contact">Xem thông tin liên hệ cửa hàng</Link>.</p>
  </div>;
}

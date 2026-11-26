import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { addressCatalog,findProvince } from './address-catalog';
import {
  getMyAddresses,
  addAddress,
  editAddress,
  makeDefaultAddress,
  removeAddress,
} from "./address.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));
router.get('/catalog', (req,res)=>{const province=typeof req.query.province==='string'?findProvince(req.query.province):null;res.json({success:true,data:province?{wards:province.wards.map(w=>w.name)}:{provinces:addressCatalog.map(p=>({name:p.name,aliases:p.aliases}))}});});

router.get("/", getMyAddresses);
router.post("/", addAddress);
router.patch("/:id", editAddress);
router.patch("/:id/default", makeDefaultAddress);
router.delete("/:id", removeAddress);

export default router;

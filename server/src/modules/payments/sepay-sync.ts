import { SepayAttempt } from './sepay.model';
import { sepayConfig } from './sepay.config';
import { reconcileSepay } from './sepay.service';

/** Recover delayed/missing IPNs using authenticated gateway reads. */
export function startSepaySync() {
  let running = false;
  const sync = async () => {
    const config = sepayConfig();
    if (running || !config) return;
    running = true;
    try {
      const attempts = await SepayAttempt.find({merchantId:config.merchantId,status:'PENDING',createdAt:{$gte:new Date(Date.now()-7*86400000)}}).sort({updatedAt:1}).limit(10).lean();
      for (const attempt of attempts) {
        try { await reconcileSepay(String(attempt.userId),String(attempt.orderId)); }
        catch { /* Keep pending on gateway errors; retry the next cycle. */ }
        await SepayAttempt.updateOne({_id:attempt._id,status:'PENDING'},{$set:{updatedAt:new Date()}});
      }
    } catch { console.warn('SePay background reconciliation unavailable; will retry.'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void sync(), 30000);
  timer.unref();
  void sync();
  return () => clearInterval(timer);
}

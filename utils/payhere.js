import crypto from 'crypto';

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

export const formatPayHereAmount = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2); // PayHere expects "0.00"
};

export const verifyPayHereMd5Sig = ({
  merchant_id,
  order_id,
  payhere_amount,
  payhere_currency,
  status_code,
  md5sig,
  merchant_secret,
}) => {
  if (!merchant_secret) return false;
  if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || !status_code || !md5sig) return false;

  const local =
    md5(
      merchant_id +
        order_id +
        payhere_amount +
        payhere_currency +
        status_code +
        md5(merchant_secret).toUpperCase()
    ).toUpperCase();

  return local === String(md5sig).toUpperCase();
};
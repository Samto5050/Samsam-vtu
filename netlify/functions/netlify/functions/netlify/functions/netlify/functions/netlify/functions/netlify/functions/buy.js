const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { supabase, ok, err, preflight } = require('./_db');

async function authenticate(event) {
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, wallet_balance')
      .eq('id', decoded.userId)
      .single();
    return user;
  } catch { return null; }
}

const SERVICE_IDS = {
  mtn: { data: 'mtn-data', airtime: 'mtn' },
  airtel: { data: 'airtel-data', airtime: 'airtel' },
  glo: { data: 'glo-data', airtime: 'glo' },
  '9mobile': { data: 'etisalat-data', airtime: 'etisalat' },
  dstv: 'dstv',
  gotv: 'gotv',
  startimes: 'startimes',
  ekedc: 'ekedc-prepaid',
  ikedc: 'ikeja-electric',
  aedc: 'abuja-electric',
  phed: 'phed',
  eedc: 'enugu-electric',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const user = await authenticate(event);
  if (!user) return err('Unauthorized. Please log in again.', 401);

  try {
    const body = JSON.parse(event.body);
    const { service, network, phone, plan_code, amount, meter, disco, smartcard, cable_plan } = body;

    if (!service) return err('Service is required');

    const cost = parseFloat(amount);
    if (isNaN(cost) || cost <= 0) return err('Invalid amount');
    if (user.wallet_balance < cost) return err('Insufficient wallet balance. Please fund your wallet.');

    const requestId = 'SSM' + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
    let vtpassBody = { request_id: requestId, amount: cost };
    let serviceLabel = '';

    if (service === 'data') {
      vtpassBody.serviceID = SERVICE_IDS[network]?.data;
      vtpassBody.billersCode = phone;
      vtpassBody.variation_code = plan_code;
      vtpassBody.phone = phone;
      serviceLabel = network.toUpperCase() + ' Data';
    } else if (service === 'airtime') {
      vtpassBody.serviceID = SERVICE_IDS[network]?.airtime;
      vtpassBody.billersCode = phone;
      vtpassBody.amount = cost;
      vtpassBody.phone = phone;
      serviceLabel = network.toUpperCase() + ' Airtime';
    } else if (service === 'cable') {
      vtpassBody.serviceID = SERVICE_IDS[body.provider?.toLowerCase()];
      vtpassBody.billersCode = smartcard;
      vtpassBody.variation_code = cable_plan;
      vtpassBody.phone = user.email;
      vtpassBody.subscription_type = 'change';
      serviceLabel = body.provider + ' Subscription';
    } else if (service === 'electricity') {
      vtpassBody.serviceID = SERVICE_IDS[disco?.toLowerCase()];
      vtpassBody.billersCode = meter;
      vtpassBody.variation_code = 'prepaid';
      vtpassBody.amount = cost;
      vtpassBody.phone = phone || user.email;
      serviceLabel = disco + ' Electricity';
    } else {
      return err('Unknown service type');
    }

    const vtpassRes = await fetch(process.env.VTPASS_BASE_URL + '/pay', {
      method: 'POST',
      headers: {
        'api-key': process.env.VTPASS_API_KEY,
        'secret-key': process.env.VTPASS_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vtpassBody),
    });

    const vtpassData = await vtpassRes.json();

    if (vtpassData.code !== '000') {
      return err(vtpassData.response_description || 'Transaction failed. Please try again.');
    }

    const newBalance = user.wallet_balance - cost;
    await supabase
      .from('users')
      .update({ wallet_balance: newBalance, total_spent: supabase.raw('total_spent + ' + cost) })
      .eq('id', user.id);

    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'debit',
      service: serviceLabel,
      detail: phone || meter || smartcard || '',
      amount: cost,
      reference: requestId,
      status: 'success',
      vtpass_response: JSON.stringify(vtpassData),
    });

    return ok({
      message: serviceLabel + ' purchase successful!',
      reference: requestId,
      new_balance: newBalance,
      vtpass: vtpassData,
    });

  } catch (e) {
    console.error('Buy error:', e);
    return err('Transaction failed. Please try again.', 500);
  }
};

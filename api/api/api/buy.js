const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SERVICE_IDS = {
  mtn: { data: 'mtn-data', airtime: 'mtn' },
  airtel: { data: 'airtel-data', airtime: 'airtel' },
  glo: { data: 'glo-data', airtime: 'glo' },
  '9mobile': { data: 'etisalat-data', airtime: 'etisalat' },
  dstv: 'dstv', gotv: 'gotv', startimes: 'startimes',
  ekedc: 'ekedc-prepaid', ikedc: 'ikeja-electric',
  aedc: 'abuja-electric', phed: 'phed', eedc: 'enugu-electric',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, wallet_balance')
      .eq('id', decoded.userId)
      .single();

    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { service, network, phone, plan_code, amount, meter, disco, smartcard, cable_plan, provider } = req.body;

    const cost = parseFloat(amount);
    if (isNaN(cost) || cost <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    if (user.wallet_balance < cost) return res.status(400).json({ success: false, message: 'Insufficient wallet balance. Please fund your wallet.' });

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
      vtpassBody.serviceID = SERVICE_IDS[provider?.toLowerCase()];
      vtpassBody.billersCode = smartcard;
      vtpassBody.variation_code = cable_plan;
      vtpassBody.phone = user.email;
      vtpassBody.subscription_type = 'change';
      serviceLabel = provider + ' Subscription';
    } else if (service === 'electricity') {
      vtpassBody.serviceID = SERVICE_IDS[disco?.toLowerCase()];
      vtpassBody.billersCode = meter;
      vtpassBody.variation_code = 'prepaid';
      vtpassBody.amount = cost;
      vtpassBody.phone = phone || user.email;
      serviceLabel = disco + ' Electricity';
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

    if (vtpassData.code !== '000')
      return res.status(400).json({ success: false, message: vtpassData.response_description || 'Transaction failed.' });

    const newBalance = user.wallet_balance - cost;
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'debit', service: serviceLabel,
      detail: phone || meter || smartcard || '',
      amount: cost, reference: requestId, status: 'success',
    });

    return res.status(200).json({ success: true, message: serviceLabel + ' successful!', new_balance: newBalance });

  } catch (e) {
    console.error('Buy error:', e);
    return res.status(500).json({ success: false, message: 'Transaction failed. Please try again.' });
  }
};

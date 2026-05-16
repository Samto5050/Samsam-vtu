const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature'])
      return res.status(401).json({ success: false, message: 'Unauthorized' });

    const payload = req.body;
    if (payload.event !== 'charge.success')
      return res.status(200).json({ message: 'Event ignored' });

    const { reference, amount, customer } = payload.data;
    const amountNaira = amount / 100;

    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('reference', reference)
      .single();

    if (existing) return res.status(200).json({ message: 'Already processed' });

    const { data: user } = await supabase
      .from('users')
      .select('id, wallet_balance')
      .eq('email', customer.email.toLowerCase())
      .single();

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const newBalance = user.wallet_balance + amountNaira;

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'credit',
      service: 'Wallet Funding',
      detail: 'Via Paystack · Ref: ' + reference,
      amount: amountNaira,
      reference,
      status: 'success',
    });

    return res.status(200).json({ success: true, message: 'Wallet credited' });

  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(500).json({ success: false, message: 'Webhook failed' });
  }
};

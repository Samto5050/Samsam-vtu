const crypto = require('crypto');
const { supabase, ok, err } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(event.body)
      .digest('hex');

    if (hash !== event.headers['x-paystack-signature']) {
      return err('Unauthorized', 401);
    }

    const payload = JSON.parse(event.body);

    if (payload.event !== 'charge.success') {
      return ok({ message: 'Event ignored' });
    }

    const { reference, amount, customer } = payload.data;
    const amountNaira = amount / 100;

    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('reference', reference)
      .single();

    if (existing) return ok({ message: 'Already processed' });

    const { data: user } = await supabase
      .from('users')
      .select('id, wallet_balance')
      .eq('email', customer.email.toLowerCase())
      .single();

    if (!user) return err('User not found', 404);

    const newBalance = user.wallet_balance + amountNaira;

    await supabase
      .from('users')
      .update({ wallet_balance: newBalance })
      .eq('id', user.id);

    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'credit',
      service: 'Wallet Funding',
      detail: 'Via Paystack · Ref: ' + reference,
      amount: amountNaira,
      reference,
      status: 'success',
    });

    return ok({ message: 'Wallet credited successfully' });

  } catch (e) {
    console.error('Webhook error:', e);
    return err('Webhook processing failed', 500);
  }
};

const jwt = require('jsonwebtoken');
const { supabase, ok, err, preflight } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return err('Unauthorized', 401);

  try {
    const decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);

    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, phone, wallet_balance, total_spent, created_at')
      .eq('id', decoded.userId)
      .single();

    if (!user) return err('User not found', 404);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    return ok({ user, transactions: transactions || [] });

  } catch (e) {
    return err('Session expired. Please log in again.', 401);
  }
};

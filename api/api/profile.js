const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);

    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, phone, wallet_balance, total_spent, created_at')
      .eq('id', decoded.userId)
      .single();

    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({ success: true, user, transactions: transactions || [] });

  } catch (e) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
};

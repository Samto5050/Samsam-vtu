const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, ok, err, preflight } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  try {
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) return err('Email and password are required');

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, phone, wallet_balance, total_spent, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) return err('Invalid email or password');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return err('Invalid email or password');

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password_hash, ...safeUser } = user;
    return ok({ token, user: safeUser });

  } catch (e) {
    console.error('Login error:', e);
    return err('Login failed. Please try again.', 500);
  }
};

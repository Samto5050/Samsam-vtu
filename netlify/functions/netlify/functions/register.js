bcrypt bcryptt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, ok, err, preflight } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  try {
    const { name, email, phone, password } = JSON.parse(event.body);

    if (!name || !email || !phone || !password)
      return err('All fields are required');
    if (password.length < 8)
      return err('Password must be at least 8 characters');
    if (!/^\S+@\S+\.\S+$/.test(email))
      return err('Invalid email address');

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) return err('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        password_hash: passwordHash,
        wallet_balance: 0,
        total_spent: 0,
      })
      .select('id, name, email, phone, wallet_balance')
      .single();

    if (error) throw error;

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return ok({ token, user });

  } catch (e) {
    console.error('Register error:', e);
    return err('Registration failed. Please try again.', 500);
  }
};

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function ok(data, status) {
  status = status || 200;
  return { statusCode: status, headers: cors, body: JSON.stringify({ success: true, ...data }) };
}

function err(message, status) {
  status = status || 400;
  return { statusCode: status, headers: cors, body: JSON.stringify({ success: false, message: message }) };
}

function preflight() {
  return { statusCode: 200, headers: cors, body: '' };
}

module.exports = { supabase, ok, err, preflight };

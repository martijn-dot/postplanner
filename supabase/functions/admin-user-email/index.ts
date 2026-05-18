import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase function environment is not configured.');
    }

    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization header.');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authUser, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser.user) throw new Error('Not authenticated.');

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role,is_active')
      .eq('id', authUser.user.id)
      .single();

    if (profileError || profile?.role !== 'admin' || profile?.is_active === false) {
      throw new Error('Only admins can send user emails.');
    }

    const { email, mode } = await request.json();
    if (!email || !String(email).includes('@')) throw new Error('A valid email address is required.');

    const siteUrl = Deno.env.get('SITE_URL') ?? request.headers.get('Origin') ?? new URL(request.url).origin;
    const redirectTo = `${siteUrl.replace(/\/$/, '')}/login?mode=update-password`;

    if (mode === 'invite') {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) throw error;
      return Response.json({ ok: true, userId: data.user?.id ?? null }, { headers: corsHeaders });
    }

    if (mode === 'reset') {
      const { error } = await userClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    throw new Error('Unsupported email mode.');
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not send email.' },
      { status: 400, headers: corsHeaders },
    );
  }
});

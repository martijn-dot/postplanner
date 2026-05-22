import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function findAuthUserByEmail(adminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('admin-user-email request received');
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
    console.log(`admin-user-email authenticated user: ${authUser.user.id}`);

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role,is_active')
      .eq('id', authUser.user.id)
      .single();

    if (profileError || profile?.role !== 'admin' || profile?.is_active === false) {
      console.error('admin-user-email admin check failed', {
        profileError: profileError?.message,
        role: profile?.role,
        isActive: profile?.is_active,
      });
      throw new Error('Only admins can send user emails.');
    }

    const { email, mode, targetUserId, invitationId } = await request.json();
    console.log(`admin-user-email mode=${mode} email=${email ?? 'none'} targetUserId=${targetUserId ?? 'none'}`);

    const siteUrl = Deno.env.get('SITE_URL') ?? request.headers.get('Origin') ?? new URL(request.url).origin;
    const redirectTo = `${siteUrl.replace(/\/$/, '')}/login?mode=update-password`;
    console.log(`admin-user-email redirectTo=${redirectTo}`);

    if (mode === 'invite') {
      if (!email || !String(email).includes('@')) throw new Error('A valid email address is required.');
      const inviteEmail = String(email).trim().toLowerCase();
      const existingUser = await findAuthUserByEmail(adminClient, inviteEmail);

      if (existingUser) {
        const { data: existingProfile, error: existingProfileError } = await adminClient
          .from('profiles')
          .select('id,is_active')
          .eq('id', existingUser.id)
          .maybeSingle();
        if (existingProfileError) throw existingProfileError;

        const isActivePlannerUser = existingProfile?.is_active !== false && Boolean(existingProfile?.id);
        if (existingUser.email_confirmed_at && isActivePlannerUser) {
          return Response.json(
            { error: 'This user already has an active account. Use reset password instead.' },
            { status: 409, headers: corsHeaders },
          );
        }

        const deleted = await adminClient.auth.admin.deleteUser(existingUser.id);
        if (deleted.error) throw deleted.error;
        await adminClient.from('profiles').delete().eq('id', existingUser.id);
      }

      await adminClient.from('invitations').delete().ilike('email', inviteEmail);

      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(inviteEmail, { redirectTo });
      if (error) {
        console.error('admin-user-email invite failed', {
          message: error.message,
          name: error.name,
          status: error.status,
        });
        throw error;
      }
      console.log(`admin-user-email invite sent userId=${data.user?.id ?? 'none'}`);
      return Response.json({ ok: true, userId: data.user?.id ?? null }, { headers: corsHeaders });
    }

    if (mode === 'reset') {
      if (!email || !String(email).includes('@')) throw new Error('A valid email address is required.');
      const { error } = await userClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        console.error('admin-user-email reset failed', {
          message: error.message,
          name: error.name,
          status: error.status,
        });
        throw error;
      }
      console.log('admin-user-email reset sent');
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (mode === 'revoke-invite') {
      if (!email || !String(email).includes('@')) throw new Error('A valid email address is required.');
      if (invitationId) {
        const { error } = await adminClient.from('invitations').delete().eq('id', invitationId);
        if (error) throw error;
      }
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;
      const invitedUser = data.users.find((item) => item.email?.toLowerCase() === String(email).toLowerCase() && !item.email_confirmed_at);
      if (invitedUser) {
        const deleted = await adminClient.auth.admin.deleteUser(invitedUser.id);
        if (deleted.error) throw deleted.error;
      }
      console.log('admin-user-email invite revoked');
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (mode === 'delete-user') {
      if (!targetUserId) throw new Error('Missing target user.');
      if (targetUserId === authUser.user.id) throw new Error('You cannot delete your own admin account.');

      const { count: adminCount, error: adminCountError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);
      if (adminCountError) throw adminCountError;

      const { data: targetProfile, error: targetProfileError } = await adminClient
        .from('profiles')
        .select('role, display_name, email')
        .eq('id', targetUserId)
        .single();
      if (targetProfileError) throw targetProfileError;
      if (targetProfile.role === 'admin' && (adminCount ?? 0) <= 1) {
        throw new Error('You cannot delete the last admin.');
      }

      const { data: adminProfile, error: adminProfileError } = await adminClient
        .from('profiles')
        .select('display_name')
        .eq('id', authUser.user.id)
        .single();
      if (adminProfileError) throw adminProfileError;

      const projectFields = ['user_id', 'created_by', 'last_edited_by', 'archived_by'];
      for (const field of projectFields) {
        const { error } = await adminClient
          .from('projects')
          .update({ [field]: authUser.user.id })
          .eq(field, targetUserId);
        if (error) throw error;
      }

      for (const field of ['post_producer', 'producer']) {
        const { error } = await adminClient
          .from('projects')
          .update({ [field]: adminProfile.display_name })
          .eq(field, targetProfile.display_name);
        if (error) throw error;
      }

      const { error: invitedProfilesError } = await adminClient
        .from('profiles')
        .update({ invited_by: authUser.user.id })
        .eq('invited_by', targetUserId);
      if (invitedProfilesError) throw invitedProfilesError;

      const { error: invitationsByUserError } = await adminClient
        .from('invitations')
        .delete()
        .eq('invited_by', targetUserId);
      if (invitationsByUserError) throw invitationsByUserError;

      const { error: invitationsByEmailError } = await adminClient
        .from('invitations')
        .delete()
        .ilike('email', targetProfile.email);
      if (invitationsByEmailError) throw invitationsByEmailError;

      for (const table of ['clients', 'producers']) {
        const { error } = await adminClient
          .from(table)
          .update({ created_by: authUser.user.id })
          .eq('created_by', targetUserId);
        if (error) throw error;
      }

      const { error: presenceError } = await adminClient.from('project_presence').delete().eq('user_id', targetUserId);
      if (presenceError) throw presenceError;

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (deleteError) throw deleteError;

      console.log(`admin-user-email deleted user ${targetUserId}`);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    throw new Error('Unsupported email mode.');
  } catch (error) {
    console.error('admin-user-email failed', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not send email.' },
      { status: 400, headers: corsHeaders },
    );
  }
});

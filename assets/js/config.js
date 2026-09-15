// Mika Creator – Supabase configuration (public client config, safe for the browser)
// The publishable/anon key is designed to be embedded in frontends.
// Row Level Security policies in supabase/schema.sql protect the data.
var MIKA_CONFIG = {
  supabaseUrl: 'https://fvvigdiwtpqzfywgmfoe.supabase.co',
  supabaseAnonKey: 'sb_publishable_Sz2wM13KPaRF8Hqe1xKdBQ_ZBNQPaz6',
  votesTable: 'votes',
  reviewsTable: 'reviews',
  toggleVoteFunc: 'toggle_vote'
};
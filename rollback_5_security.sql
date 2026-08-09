-- SECURITY ROLLBACK (μόνο αν επιστρέψεις προσωρινά στον παλιό κώδικα).
-- Δεν αφαιρούμε pin_hash/session_version, γιατί αυτό θα μπορούσε να κλειδώσει
-- καταστήματα των οποίων το παλιό plaintext PIN έχει ήδη καθαριστεί.
drop table if exists auth_rate_limits;
drop index if exists stations_reset_token_hash_idx;

/**
 * Configurazione del database condiviso (Supabase).
 *
 * Lasciando i due valori vuoti, l'app salva i dati solo nel browser in uso.
 * Compilandoli, tutte le sedi lavorano sugli stessi dati dopo l'accesso con email e password.
 * La chiave "publishable" (o "anon") è pubblica per progetto: i dati sono protetti dalle regole
 * definite in supabase/schema.sql, che consentono l'accesso solo agli utenti registrati.
 */
window.TURNI_CONFIG = {
  supabaseUrl: 'https://teiiugkpvtigzoipywhl.supabase.co',
  supabaseAnonKey: 'sb_publishable_Pv5QXNwYREmiwKPgzN-TUw_MdkGUR5F',
};

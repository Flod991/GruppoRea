# Turni Gruppo Rea

App web per pianificare i turni dei dipendenti nei punti vendita **Decò Volla, Decò Casoria, MD Volla, MD Casoria e MD Somma**,
reparto per reparto: Panetteria, Salumeria, Macelleria, Pescheria, Ortofrutta, Casse e Scaffali.

Ogni giornata ha due turni, **mattino** e **pomeriggio**. Per ogni reparto si sceglie quante persone servono in ciascun turno
e l'app genera i turni in modo che ogni dipendente abbia mattine e pomeriggi bilanciati.

## Come si usa

In alto si scelgono **punto vendita** e **reparto**. Le schede sono tre.

- **Turni**: la settimana del reparto scelto. La prima riga contiene le persone richieste per ogni giorno (M = mattino, P = pomeriggio):
  basta cambiare il numero. *Genera turni* compila la settimana; poi ogni casella si cambia con un tocco
  (— → Mattino → Pomeriggio → —). L'ultima riga mostra la copertura, l'ultima colonna l'equilibrio mattine/pomeriggi
  di ciascuno su tutte le settimane salvate. Scegliendo *Tutti i reparti* si vede la panoramica del punto vendita.
- **Personale**: aggiunta e modifica dei dipendenti, con i turni massimi a settimana e i giorni in cui non sono disponibili
  (riposo, solo mattino, solo pomeriggio).
- **Impostazioni**: orari dei turni, regole di generazione, copia delle persone richieste su altre sedi, backup.

Nel menu *Altro* dei turni ci sono Copia per Excel, Scarica CSV, Stampa e Svuota settimana.

## Come vengono generati i turni

Per ogni reparto il generatore:

- assegna al massimo **un turno al giorno** per persona e rispetta indisponibilità e turni massimi settimanali;
- distribuisce il **carico in modo equo** tra i colleghi dello stesso reparto;
- **bilancia mattine e pomeriggi** di ciascuno: chi nelle settimane precedenti ha fatto più mattine riceve più pomeriggi,
  e viceversa (si può disattivare nelle Impostazioni);
- evita quando possibile il pomeriggio seguito dal mattino del giorno dopo.

Se servono più mattine che pomeriggi (ad esempio la domenica aperta solo di mattina), il pareggio perfetto non è possibile:
la differenza viene distribuita su tutti e compensata settimana dopo settimana.

## Pubblicazione su GitHub Pages

1. Su GitHub apri **Settings → Pages**.
2. In *Build and deployment* scegli **Deploy from a branch**, seleziona il branch dell'app e la cartella **/ (root)**, poi **Save**.
3. Dopo un paio di minuti l'app è su `https://flod991.github.io/GruppoRea/`.

## Database condiviso (Supabase)

Senza database i dati restano nel browser di chi usa l'app: ogni computer ha i suoi.
Per far lavorare tutte le sedi sugli stessi dati serve un progetto [Supabase](https://supabase.com) (il piano gratuito basta).

1. Crea un progetto su supabase.com.
2. Apri **SQL Editor → New query**, incolla il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
3. In **Authentication → Users → Add user** crea un utente (email e password) per ogni persona o sede che deve usare l'app.
   In **Authentication → Sign In / Providers** disattiva *Allow new users to sign up*, così nessun altro può registrarsi.
4. In **Project Settings → API** copia *Project URL* e la chiave *anon public* e inseriscile in [`js/config.js`](js/config.js).

Da quel momento l'app chiede email e password e salva tutto nel database. Ogni punto vendita è salvato separatamente:
due sedi possono lavorare nello stesso momento e le modifiche compaiono subito anche alle altre.
Al primo accesso, se nel browser c'erano già dati reali (non di esempio), vengono caricati nel database.

La chiave *anon* può stare nel codice pubblico: senza accesso con un utente registrato i dati non sono leggibili né modificabili.

## Sviluppo

```
index.html              pagina dell'app
js/scheduler.js         motore di generazione dei turni (senza dipendenze, testato in Node)
js/storage.js           salvataggio nel browser o su Supabase
js/config.js            configurazione del database
js/app.js               interfaccia
css/style.css           stili (tema chiaro/scuro e stampa)
supabase/schema.sql     tabella e regole di accesso del database
tests/                  test del motore
scripts/build-artifact.js  versione a file unico
```

Test: `npm test` (serve Node 18 o superiore). Girano anche automaticamente su GitHub a ogni modifica.

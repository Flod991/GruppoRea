# Turni Gruppo Rea

App web per pianificare i turni dei dipendenti nei punti vendita **Decò Volla, Decò Casoria, MD Volla, MD Casoria e MD Somma**,
reparto per reparto: Panetteria, Salumeria, Macelleria, Pescheria, Ortofrutta, Casse e Scaffali.

Ogni giornata ha due turni, **mattino** e **pomeriggio**. Per ogni reparto si sceglie quante persone servono in ciascun turno
e l'app genera i turni in modo che ogni dipendente abbia mattine e pomeriggi bilanciati.

## Come si usa

In alto si scelgono **punto vendita** e **reparto**. Le schede sono quattro.

- **Turni**: la settimana del reparto scelto. La prima riga contiene le persone richieste per ogni giorno (M = mattino, P = pomeriggio):
  basta cambiare il numero. *Genera turni* compila la settimana. Toccando una casella si sceglie
  **Mattino, Pomeriggio, Giornata intera, Riposo, Ferie o Assente**: la casella viene segnata con un pallino ed è considerata *inserita a mano*.
  Generando o rigenerando, le caselle inserite a mano **non vengono mai cambiate**: i turni contano per la copertura,
  e riposo, ferie e assenze tengono libero il dipendente. *Automatico* restituisce la casella al generatore.
  La giornata intera (dall'inizio del mattino alla fine del pomeriggio) copre entrambi i turni e vale un giorno di lavoro.
  L'ultima riga mostra la copertura. Scegliendo *Tutti i reparti* si vede la panoramica del punto vendita, con chi è in ferie o assente.
- **Riepilogo**: per settimana, mese (scelto da un elenco: settembre, ottobre…), anno o tutto lo storico mostra copertura, posti scoperti, copertura per reparto e,
  per ogni dipendente, mattine, pomeriggi, giornate intere, giorni lavorati, ferie, assenze ed equilibrio tra mattine e pomeriggi.
  **PDF riepilogo** crea lo stesso riepilogo in PDF: del punto vendita (con *Tutti i reparti*) o del singolo reparto.
- **Personale**: aggiunta e modifica dei dipendenti, con i turni massimi a settimana e i giorni fissi in cui non sono disponibili
  (riposo, solo mattino, solo pomeriggio).
- **Impostazioni**: orari dei turni, regole di generazione, copia delle persone richieste su altre sedi, backup.

**Invia PDF** crea il PDF dei turni della settimana (del reparto scelto o di tutti i reparti) da mandare ai dipendenti:
sul telefono apre la condivisione (WhatsApp, email…), sul computer lo scarica.

Sul telefono la settimana si vede senza scorrere di lato: ogni dipendente ha una riga di 7 caselle
(M mattino, P pomeriggio, R riposo, F ferie, A assente) e la panoramica di tutti i reparti si sfoglia giorno per giorno.

Nel menu *Altro* dei turni ci sono Copia per Excel, Scarica CSV, Stampa e Svuota settimana
(che toglie solo i turni generati e lascia quelli inseriti a mano).

## Come vengono generati i turni

Per ogni reparto il generatore:

- assegna al massimo **un turno al giorno** per persona e rispetta indisponibilità e turni massimi settimanali;
- lascia invariate le caselle inserite a mano; ogni giorno di ferie o di assenza riduce di uno i turni massimi della settimana;
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

L'app è collegata al progetto Supabase indicato in [`js/config.js`](js/config.js): per entrare servono email e password
di un utente creato in **Authentication → Users**. Per aggiungere una persona basta creare lì un nuovo utente.

Svuotando i due valori di `js/config.js` l'app torna a salvare i dati solo nel browser.
Per collegare un nuovo progetto Supabase:

1. Crea un progetto su supabase.com.
2. Apri **SQL Editor → New query**, incolla il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
3. In **Authentication → Users → Add user** crea un utente (email e password) per ogni persona o sede che deve usare l'app.
   In **Authentication → Sign In / Providers** disattiva *Allow new users to sign up*, così nessun altro può registrarsi.
4. In **Project Settings → API Keys** copia *Project URL* e la chiave *publishable* (o *anon public*) e inseriscile in [`js/config.js`](js/config.js).

Da quel momento l'app chiede email e password e salva tutto nel database. Ogni punto vendita è salvato separatamente:
due sedi possono lavorare nello stesso momento e le modifiche compaiono subito anche alle altre.
Al primo accesso, se nel browser c'erano già dati reali (non di esempio), vengono caricati nel database.

La chiave *publishable* può stare nel codice pubblico: senza accesso con un utente registrato i dati non sono leggibili né modificabili.

## Sviluppo

```
index.html              pagina dell'app
js/scheduler.js         motore di generazione dei turni (senza dipendenze, testato in Node)
js/storage.js           salvataggio nel browser o su Supabase
js/config.js            configurazione del database
js/pdf.js               creazione del PDF dei turni
js/vendor/              librerie esterne con licenza MIT: supabase-js 2.116.0, jsPDF 4.2.1, jsPDF-AutoTable 5.0.8
js/app.js               interfaccia
css/style.css           stili (tema chiaro/scuro e stampa)
supabase/schema.sql     tabella e regole di accesso del database
tests/                  test del motore
scripts/build-artifact.js  versione a file unico
```

Test: `npm test` (serve Node 18 o superiore). Girano anche automaticamente su GitHub a ogni modifica.

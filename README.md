# Turni Gruppo Rea

App web per pianificare i turni dei dipendenti nei punti vendita **Decò Volla, Decò Casoria, MD Volla, MD Casoria e MD Somma**,
reparto per reparto: Panetteria, Salumeria, Macelleria, Pescheria, Ortofrutta, Casse e Scaffali.

Ogni giornata è divisa in due turni, **mattino** e **pomeriggio**, e per ciascun reparto si decide quante persone servono in ogni turno.
Il generatore assegna i turni in modo che ogni dipendente abbia un numero equilibrato di mattine e pomeriggi.

## Come si usa

Apri `index.html` in un browser. Non serve installare nulla né avere un server.
Per pubblicarla basta un hosting statico, ad esempio GitHub Pages.

1. **Punto vendita**: sceglilo in alto a destra. Tutte le schede si riferiscono alla sede selezionata.
2. **Dipendenti**: inserisci nome, sede, reparto, turni massimi a settimana e indisponibilità fisse
   (riposo, solo mattino, solo pomeriggio) per ciascun giorno.
3. **Fabbisogno**: indica per ogni reparto, giorno e turno quante persone servono (0 = reparto chiuso).
   Sotto ogni reparto vedi se il personale basta a coprire la settimana. Puoi copiare il fabbisogno sulle altre sedi.
4. **Turni**: scegli la settimana e premi *Genera turni*. Puoi poi correggere a mano: la × toglie una persona,
   il menu *+ Aggiungi…* ne aggiunge una, anche da un altro reparto. I posti scoperti vengono segnalati.
   La vista *Per dipendente* mostra la settimana di ciascuno. Si può esportare in CSV (apribile con Excel) o stampare.
5. **Riepilogo**: mattine, pomeriggi e bilanciamento di ogni dipendente, per la settimana e per tutto lo storico.

## Come vengono generati i turni

Per ogni reparto il generatore:

- assegna al massimo **un turno al giorno** per persona e rispetta indisponibilità e turni massimi settimanali;
- distribuisce il **carico in modo equo** tra i colleghi dello stesso reparto;
- **bilancia mattine e pomeriggi** di ciascuno; con l'opzione *Compensa lo storico*
  chi nelle settimane precedenti ha fatto più mattine riceve più pomeriggi, e viceversa;
- evita quando possibile il pomeriggio seguito dal mattino del giorno dopo.

Parte da un'assegnazione giorno per giorno e poi la migliora con scambi tra colleghi
(mattino ↔ pomeriggio nello stesso giorno, sostituzioni con chi è a riposo) finché il risultato non migliora più.

Il bilanciamento perfetto non è sempre possibile. Ad esempio, se la domenica si lavora solo di mattina ci sono più mattine
che pomeriggi da distribuire: in quel caso la differenza viene spalmata su tutti e compensata settimana dopo settimana.

## Dati

I dati restano nel browser (localStorage) del computer su cui si usa l'app.
Da *Impostazioni* puoi esportare e importare un backup JSON, ad esempio per spostarli su un altro PC.
Al primo avvio vengono caricati dati di esempio, che si possono eliminare con un clic.

## Sviluppo

```
js/scheduler.js   motore di generazione (senza dipendenze, usabile anche in Node)
js/app.js         interfaccia
css/style.css     stili (tema chiaro/scuro e stampa)
tests/            test del motore
```

Per eseguire i test serve Node 18 o superiore: `npm test`.

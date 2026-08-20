# Asta fantacalcio live

Next.js 15 (App Router) + Upstash Redis. Ognuno rilancia dal proprio telefono, un banditore apre i lotti e aggiudica.

## Deploy su Vercel

### 1. Metti il codice su GitHub

```bash
cd asta-fantacalcio
git init
git add .
git commit -m "Asta fantacalcio live"
git remote add origin https://github.com/marcogiana/asta-fantacalcio.git
git push -u origin main
```

### 2. Importa su Vercel

Su vercel.com → **Add New → Project** → scegli il repo. Framework rilevato: Next.js. Non toccare le impostazioni di build.
**Non fare deploy ancora**: la prima build fallirebbe solo a runtime, non in compilazione, ma tanto vale collegare prima il database.

### 3. Collega Redis

Progetto → tab **Storage** → **Create Database** → dal Marketplace scegli **Upstash for Redis** (Vercel KV non esiste più: dal dicembre 2024 è stato spostato su Upstash). Piano free, regione **eu-west-1** o **eu-central-1** per stare vicino a Milano.

Vercel inietta da solo `KV_REST_API_URL` e `KV_REST_API_TOKEN`. Non serve copiarle a mano.

Da CLI, se preferisci:

```bash
npm i -g vercel
vercel link
vercel install upstash
```

### 4. Variabili facoltative

Settings → Environment Variables:

| Nome | A cosa serve |
|---|---|
| `ASTA_PIN` | Se valorizzata, ogni modifica richiede questo PIN. Utile se il link gira su WhatsApp. |
| `ASTA_NAMESPACE` | Cambiala (es. `asta:2027`) per ricominciare da zero conservando i dati vecchi. |
| `ASTA_TTL_GIORNI` | Giorni di inattività dopo cui un'asta viene cancellata da Redis. Default 180. |

### 5. Deploy

**Deployments → Redeploy** dopo aver collegato Redis, così le variabili entrano nella build. Ottieni un URL tipo `asta-fantacalcio.vercel.app`.

### 6. Dominio tuo (facoltativo)

Settings → Domains → aggiungi `asta.eleluci.it`. Su Aruba crea un CNAME `asta` → `cname.vercel-dns.com`.

## Come si usa

1. Dalla home clicchi **Crea una nuova asta**: nome lega, modalità Classic o Mantra, crediti, slot, squadre, listone.
2. Ottieni un **codice di 5 caratteri** e finisci su `/a/CODICE`.
3. Scegli la tua squadra spuntando **sono io il banditore**, poi **Invita gli altri** per mandare il link.
4. Gli altri aprono il link, oppure entrano dalla home digitando il codice.
5. Tu chiami i giocatori, loro rilanciano.

Più aste possono girare in parallelo: ognuna ha il suo codice e i suoi dati. La home elenca le aste viste
da quel dispositivo (l'elenco sta nel browser, non sul server); da un altro telefono si entra col codice.

## Sviluppo locale

```bash
npm install
cp .env.example .env.local   # incolla URL e token dalla dashboard Upstash
npm run dev
```

Per provare il multi-dispositivo in locale usa l'IP della macchina (`http://192.168.x.x:3000`) dal telefono, stessa rete.

## Note tecniche

- **Rilanci atomici.** Il valore della puntata sta in una chiave Redis nel formato `importo|squadra|scadenza`, aggiornata da uno script Lua che scrive solo se l'offerta è più alta di quella presente. Due rilanci nello stesso millisecondo non possono sovrascriversi: chi perde riceve 409 e vede l'importo che l'ha battuto.
- **Tetto di spesa validato lato server.** Il client spegne i pulsanti, ma è l'API a rifiutare offerte oltre il massimo — quindi non si aggira con i devtools.
- **Polling da 1,2s** su `/api/asta/live?rev=N`, che risponde `204` senza corpo se nulla è cambiato: una lettura di una chiave per giro. Con 10 partecipanti sono ~8 richieste/s, dentro il piano free di Upstash (500k comandi/mese) per un'asta di qualche ora.
- **Le rose stanno in una lista Redis**, in append. L'annulla usa `RPOP`, quindi è atomico anche lui.
- **Se vuoi il vero realtime**, sostituisci il polling con Supabase Realtime o Pusher: cambia solo `lib/api.js` e la route `live`.

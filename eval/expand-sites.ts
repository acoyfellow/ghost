import { readFileSync, writeFileSync } from "node:fs";

const blocked = /porn|xxx|sex|xvideo|xnxx|xhamster|redtube|youporn|onlyfans|adult|escort|nude|cam4|chaturbate|casino|bet|poker|gambl|slot|lotto|bingo|jackpot|bwin|1xbet|stake|wager/i;
const step = 50;
const firstRank = 6050;
const lastRank = 21000;

const euNewsCommerce = [
  "sueddeutsche.de", "focus.de", "stern.de", "spiegel.fr", "lemonde.fr", "liberation.fr", "leparisien.fr", "france24.com",
  "lastampa.it", "ilsole24ore.com", "gazzetta.it", "ansa.it", "elconfidencial.com", "lavanguardia.com", "abc.es", "20minutos.es",
  "metro.co.uk", "mirror.co.uk", "thesun.co.uk", "standard.co.uk", "skynews.com", "ft.com", "economist.com", "reuters.com",
  "booking.com", "tripadvisor.co.uk", "skyscanner.net", "ryanair.com", "easyjet.com", "lufthansa.com", "airfrance.fr", "kayak.co.uk",
  "argos.co.uk", "johnlewis.com", "tesco.com", "currys.co.uk", "mediamarkt.de", "aboutyou.de", "vinted.fr", "allegro.pl",
];

const existing = readFileSync("sites.txt", "utf8").split("\n").filter(Boolean);
const taken = new Set(existing);
const ranked = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((line) => line.split(",")[1].trim());

const sampled: string[] = [];
for (let rank = firstRank; rank <= lastRank; rank += step) {
  let index = rank - 1;
  while (index < ranked.length && (blocked.test(ranked[index]) || taken.has(ranked[index]))) index++;
  taken.add(ranked[index]);
  sampled.push(ranked[index]);
}

const extraEu = euNewsCommerce.filter((d) => !taken.has(d)).slice(0, 40);
extraEu.forEach((d) => taken.add(d));
writeFileSync("sites.txt", [...existing, ...sampled, ...extraEu].join("\n") + "\n");
console.log(sampled.length, extraEu.length);

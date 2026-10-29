#!/usr/bin/env node
// World Clock - shows the current time in every country, live.
// One file, no dependencies. Run: node world-clock.mjs  (then open http://localhost:3000)
// Options: PORT=8080 node world-clock.mjs
//
// Routes:  /          the web page
//          /api/time  JSON with the current time in every country (computed on the server)

import http from 'node:http';

// Country list from the IANA tz database (iso3166.tab + zone.tab):
// CODE;Country name;Zone=Region note|Zone=Region note|...
const DATA = `
AD;Andorra;Europe/Andorra
AE;United Arab Emirates;Asia/Dubai
AF;Afghanistan;Asia/Kabul
AG;Antigua & Barbuda;America/Antigua
AI;Anguilla;America/Anguilla
AL;Albania;Europe/Tirane
AM;Armenia;Asia/Yerevan
AO;Angola;Africa/Luanda
AQ;Antarctica;Antarctica/McMurdo=New Zealand time - McMurdo, South Pole|Antarctica/Casey=Casey|Antarctica/Davis=Davis|Antarctica/DumontDUrville=Dumont-d'Urville|Antarctica/Mawson=Mawson|Antarctica/Palmer=Palmer|Antarctica/Rothera=Rothera|Antarctica/Syowa=Syowa|Antarctica/Troll=Troll|Antarctica/Vostok=Vostok
AR;Argentina;America/Argentina/Buenos_Aires=Buenos Aires (BA, CF)|America/Argentina/Cordoba=Argentina (most areas: CB, CC, CN, ER, FM, MN, SE, SF)|America/Argentina/Salta=Salta (SA, LP, NQ, RN)|America/Argentina/Jujuy=Jujuy (JY)|America/Argentina/Tucuman=Tucuman (TM)|America/Argentina/Catamarca=Catamarca (CT), Chubut (CH)|America/Argentina/La_Rioja=La Rioja (LR)|America/Argentina/San_Juan=San Juan (SJ)|America/Argentina/Mendoza=Mendoza (MZ)|America/Argentina/San_Luis=San Luis (SL)|America/Argentina/Rio_Gallegos=Santa Cruz (SC)|America/Argentina/Ushuaia=Tierra del Fuego (TF)
AS;Samoa (American);Pacific/Pago_Pago
AT;Austria;Europe/Vienna
AU;Australia;Australia/Lord_Howe=Lord Howe Island|Antarctica/Macquarie=Macquarie Island|Australia/Hobart=Tasmania|Australia/Melbourne=Victoria|Australia/Sydney=New South Wales (most areas)|Australia/Broken_Hill=New South Wales (Yancowinna)|Australia/Brisbane=Queensland (most areas)|Australia/Lindeman=Queensland (Whitsunday Islands)|Australia/Adelaide=South Australia|Australia/Darwin=Northern Territory|Australia/Perth=Western Australia (most areas)|Australia/Eucla=Western Australia (Eucla)
AW;Aruba;America/Aruba
AX;Åland Islands;Europe/Mariehamn
AZ;Azerbaijan;Asia/Baku
BA;Bosnia & Herzegovina;Europe/Sarajevo
BB;Barbados;America/Barbados
BD;Bangladesh;Asia/Dhaka
BE;Belgium;Europe/Brussels
BF;Burkina Faso;Africa/Ouagadougou
BG;Bulgaria;Europe/Sofia
BH;Bahrain;Asia/Bahrain
BI;Burundi;Africa/Bujumbura
BJ;Benin;Africa/Porto-Novo
BL;St Barthelemy;America/St_Barthelemy
BM;Bermuda;Atlantic/Bermuda
BN;Brunei;Asia/Brunei
BO;Bolivia;America/La_Paz
BQ;Caribbean NL;America/Kralendijk
BR;Brazil;America/Noronha=Atlantic islands|America/Belem=Para (east), Amapa|America/Fortaleza=Brazil (northeast: MA, PI, CE, RN, PB)|America/Recife=Pernambuco|America/Araguaina=Tocantins|America/Maceio=Alagoas, Sergipe|America/Bahia=Bahia|America/Sao_Paulo=Brazil (southeast: GO, DF, MG, ES, RJ, SP, PR, SC, RS)|America/Campo_Grande=Mato Grosso do Sul|America/Cuiaba=Mato Grosso|America/Santarem=Para (west)|America/Porto_Velho=Rondonia|America/Boa_Vista=Roraima|America/Manaus=Amazonas (east)|America/Eirunepe=Amazonas (west)|America/Rio_Branco=Acre
BS;Bahamas;America/Nassau
BT;Bhutan;Asia/Thimphu
BV;Bouvet Island;Etc/UTC=Uninhabited
BW;Botswana;Africa/Gaborone
BY;Belarus;Europe/Minsk
BZ;Belize;America/Belize
CA;Canada;America/St_Johns=Newfoundland, Labrador (SE)|America/Halifax=Atlantic - NS (most areas), PE|America/Glace_Bay=Atlantic - NS (Cape Breton)|America/Moncton=Atlantic - New Brunswick|America/Goose_Bay=Atlantic - Labrador (most areas)|America/Blanc-Sablon=AST - QC (Lower North Shore)|America/Toronto=Eastern - ON & QC (most areas)|America/Iqaluit=Eastern - NU (most areas)|America/Atikokan=EST - ON (Atikokan), NU (Coral H)|America/Winnipeg=EST - Manitoba, ON (northwest)|America/Resolute=Central - NU (Resolute)|America/Rankin_Inlet=Central - NU (central)|America/Regina=CST - SK (most areas)|America/Swift_Current=CST - SK (midwest)|America/Edmonton=CST - AB, BC(E), NT(E), SK(W)|America/Cambridge_Bay=Mountain - NU (west)|America/Inuvik=CST - NT (west)|America/Vancouver=MST - BC (most areas)|America/Creston=MST - BC (Creston)|America/Dawson_Creek=MST - BC (Dawson Cr, Ft St John)|America/Fort_Nelson=MST - BC (Ft Nelson)|America/Whitehorse=MST - Yukon (east)|America/Dawson=MST - Yukon (west)
CC;Cocos (Keeling) Islands;Indian/Cocos
CD;Congo (Dem. Rep.);Africa/Kinshasa=Dem. Rep. of Congo (west)|Africa/Lubumbashi=Dem. Rep. of Congo (east)
CF;Central African Rep.;Africa/Bangui
CG;Congo (Rep.);Africa/Brazzaville
CH;Switzerland;Europe/Zurich
CI;Côte d’Ivoire;Africa/Abidjan
CK;Cook Islands;Pacific/Rarotonga
CL;Chile;America/Santiago=most of Chile|America/Coyhaique=Aysen Region|America/Punta_Arenas=Magallanes Region|Pacific/Easter=Easter Island
CM;Cameroon;Africa/Douala
CN;China;Asia/Shanghai=Beijing Time|Asia/Urumqi=Xinjiang Time
CO;Colombia;America/Bogota
CR;Costa Rica;America/Costa_Rica
CU;Cuba;America/Havana
CV;Cape Verde;Atlantic/Cape_Verde
CW;Curaçao;America/Curacao
CX;Christmas Island;Indian/Christmas
CY;Cyprus;Asia/Nicosia=most of Cyprus|Asia/Famagusta=Northern Cyprus
CZ;Czech Republic;Europe/Prague
DE;Germany;Europe/Berlin=most of Germany|Europe/Busingen=Busingen
DJ;Djibouti;Africa/Djibouti
DK;Denmark;Europe/Copenhagen
DM;Dominica;America/Dominica
DO;Dominican Republic;America/Santo_Domingo
DZ;Algeria;Africa/Algiers
EC;Ecuador;America/Guayaquil=Ecuador (mainland)|Pacific/Galapagos=Galapagos Islands
EE;Estonia;Europe/Tallinn
EG;Egypt;Africa/Cairo
EH;Western Sahara;Africa/El_Aaiun
ER;Eritrea;Africa/Asmara
ES;Spain;Europe/Madrid=Spain (mainland)|Africa/Ceuta=Ceuta, Melilla|Atlantic/Canary=Canary Islands
ET;Ethiopia;Africa/Addis_Ababa
FI;Finland;Europe/Helsinki
FJ;Fiji;Pacific/Fiji
FK;Falkland Islands;Atlantic/Stanley
FM;Micronesia;Pacific/Chuuk=Chuuk/Truk, Yap|Pacific/Pohnpei=Pohnpei/Ponape|Pacific/Kosrae=Kosrae
FO;Faroe Islands;Atlantic/Faroe
FR;France;Europe/Paris
GA;Gabon;Africa/Libreville
GB;Britain (UK);Europe/London
GD;Grenada;America/Grenada
GE;Georgia;Asia/Tbilisi
GF;French Guiana;America/Cayenne
GG;Guernsey;Europe/Guernsey
GH;Ghana;Africa/Accra
GI;Gibraltar;Europe/Gibraltar
GL;Greenland;America/Nuuk=most of Greenland|America/Danmarkshavn=National Park (east coast)|America/Scoresbysund=Scoresbysund/Ittoqqortoormiit|America/Thule=Thule/Pituffik
GM;Gambia;Africa/Banjul
GN;Guinea;Africa/Conakry
GP;Guadeloupe;America/Guadeloupe
GQ;Equatorial Guinea;Africa/Malabo
GR;Greece;Europe/Athens
GS;South Georgia & the South Sandwich Islands;Atlantic/South_Georgia
GT;Guatemala;America/Guatemala
GU;Guam;Pacific/Guam
GW;Guinea-Bissau;Africa/Bissau
GY;Guyana;America/Guyana
HK;Hong Kong;Asia/Hong_Kong
HM;Heard Island & McDonald Islands;Indian/Kerguelen=Uninhabited
HN;Honduras;America/Tegucigalpa
HR;Croatia;Europe/Zagreb
HT;Haiti;America/Port-au-Prince
HU;Hungary;Europe/Budapest
ID;Indonesia;Asia/Jakarta=Java, Sumatra|Asia/Pontianak=Borneo (west, central)|Asia/Makassar=Borneo (east, south), Sulawesi/Celebes, Bali, Nusa Tengarra, Timor (west)|Asia/Jayapura=New Guinea (West Papua / Irian Jaya), Malukus/Moluccas
IE;Ireland;Europe/Dublin
IL;Israel;Asia/Jerusalem
IM;Isle of Man;Europe/Isle_of_Man
IN;India;Asia/Kolkata
IO;British Indian Ocean Territory;Indian/Chagos
IQ;Iraq;Asia/Baghdad
IR;Iran;Asia/Tehran
IS;Iceland;Atlantic/Reykjavik
IT;Italy;Europe/Rome
JE;Jersey;Europe/Jersey
JM;Jamaica;America/Jamaica
JO;Jordan;Asia/Amman
JP;Japan;Asia/Tokyo
KE;Kenya;Africa/Nairobi
KG;Kyrgyzstan;Asia/Bishkek
KH;Cambodia;Asia/Phnom_Penh
KI;Kiribati;Pacific/Tarawa=Gilbert Islands|Pacific/Kanton=Phoenix Islands|Pacific/Kiritimati=Line Islands
KM;Comoros;Indian/Comoro
KN;St Kitts & Nevis;America/St_Kitts
KP;Korea (North);Asia/Pyongyang
KR;Korea (South);Asia/Seoul
KW;Kuwait;Asia/Kuwait
KY;Cayman Islands;America/Cayman
KZ;Kazakhstan;Asia/Almaty=most of Kazakhstan|Asia/Qyzylorda=Qyzylorda/Kyzylorda/Kzyl-Orda|Asia/Qostanay=Qostanay/Kostanay/Kustanay|Asia/Aqtobe=Aqtobe/Aktobe|Asia/Aqtau=Mangghystau/Mankistau|Asia/Atyrau=Atyrau/Atirau/Gur'yev|Asia/Oral=West Kazakhstan
LA;Laos;Asia/Vientiane
LB;Lebanon;Asia/Beirut
LC;St Lucia;America/St_Lucia
LI;Liechtenstein;Europe/Vaduz
LK;Sri Lanka;Asia/Colombo
LR;Liberia;Africa/Monrovia
LS;Lesotho;Africa/Maseru
LT;Lithuania;Europe/Vilnius
LU;Luxembourg;Europe/Luxembourg
LV;Latvia;Europe/Riga
LY;Libya;Africa/Tripoli
MA;Morocco;Africa/Casablanca
MC;Monaco;Europe/Monaco
MD;Moldova;Europe/Chisinau
ME;Montenegro;Europe/Podgorica
MF;St Martin (French);America/Marigot
MG;Madagascar;Indian/Antananarivo
MH;Marshall Islands;Pacific/Majuro=most of Marshall Islands|Pacific/Kwajalein=Kwajalein
MK;North Macedonia;Europe/Skopje
ML;Mali;Africa/Bamako
MM;Myanmar (Burma);Asia/Yangon
MN;Mongolia;Asia/Ulaanbaatar=most of Mongolia|Asia/Hovd=Bayan-Olgii, Hovd, Uvs
MO;Macau;Asia/Macau
MP;Northern Mariana Islands;Pacific/Saipan
MQ;Martinique;America/Martinique
MR;Mauritania;Africa/Nouakchott
MS;Montserrat;America/Montserrat
MT;Malta;Europe/Malta
MU;Mauritius;Indian/Mauritius
MV;Maldives;Indian/Maldives
MW;Malawi;Africa/Blantyre
MX;Mexico;America/Mexico_City=Central Mexico|America/Cancun=Quintana Roo|America/Merida=Campeche, Yucatan|America/Monterrey=Durango; Coahuila, Nuevo Leon, Tamaulipas (most areas)|America/Matamoros=Coahuila, Nuevo Leon, Tamaulipas (US border)|America/Chihuahua=Chihuahua (most areas)|America/Ciudad_Juarez=Chihuahua (US border - west)|America/Ojinaga=Chihuahua (US border - east)|America/Mazatlan=Baja California Sur, Nayarit (most areas), Sinaloa|America/Bahia_Banderas=Bahia de Banderas|America/Hermosillo=Sonora|America/Tijuana=Baja California
MY;Malaysia;Asia/Kuala_Lumpur=Malaysia (peninsula)|Asia/Kuching=Sabah, Sarawak
MZ;Mozambique;Africa/Maputo
NA;Namibia;Africa/Windhoek
NC;New Caledonia;Pacific/Noumea
NE;Niger;Africa/Niamey
NF;Norfolk Island;Pacific/Norfolk
NG;Nigeria;Africa/Lagos
NI;Nicaragua;America/Managua
NL;Netherlands;Europe/Amsterdam
NO;Norway;Europe/Oslo
NP;Nepal;Asia/Kathmandu
NR;Nauru;Pacific/Nauru
NU;Niue;Pacific/Niue
NZ;New Zealand;Pacific/Auckland=most of New Zealand|Pacific/Chatham=Chatham Islands
OM;Oman;Asia/Muscat
PA;Panama;America/Panama
PE;Peru;America/Lima
PF;French Polynesia;Pacific/Tahiti=Society Islands|Pacific/Marquesas=Marquesas Islands|Pacific/Gambier=Gambier Islands
PG;Papua New Guinea;Pacific/Port_Moresby=most of Papua New Guinea|Pacific/Bougainville=Bougainville
PH;Philippines;Asia/Manila
PK;Pakistan;Asia/Karachi
PL;Poland;Europe/Warsaw
PM;St Pierre & Miquelon;America/Miquelon
PN;Pitcairn;Pacific/Pitcairn
PR;Puerto Rico;America/Puerto_Rico
PS;Palestine;Asia/Gaza=Gaza Strip|Asia/Hebron=West Bank
PT;Portugal;Europe/Lisbon=Portugal (mainland)|Atlantic/Madeira=Madeira Islands|Atlantic/Azores=Azores
PW;Palau;Pacific/Palau
PY;Paraguay;America/Asuncion
QA;Qatar;Asia/Qatar
RE;Réunion;Indian/Reunion
RO;Romania;Europe/Bucharest
RS;Serbia;Europe/Belgrade
RU;Russia;Europe/Kaliningrad=MSK-01 - Kaliningrad|Europe/Moscow=MSK+00 - Moscow area|Europe/Kirov=MSK+00 - Kirov|Europe/Volgograd=MSK+00 - Volgograd|Europe/Astrakhan=MSK+01 - Astrakhan|Europe/Saratov=MSK+01 - Saratov|Europe/Ulyanovsk=MSK+01 - Ulyanovsk|Europe/Samara=MSK+01 - Samara, Udmurtia|Asia/Yekaterinburg=MSK+02 - Urals|Asia/Omsk=MSK+03 - Omsk|Asia/Novosibirsk=MSK+04 - Novosibirsk|Asia/Barnaul=MSK+04 - Altai|Asia/Tomsk=MSK+04 - Tomsk|Asia/Novokuznetsk=MSK+04 - Kemerovo|Asia/Krasnoyarsk=MSK+04 - Krasnoyarsk area|Asia/Irkutsk=MSK+05 - Irkutsk, Buryatia|Asia/Chita=MSK+06 - Zabaykalsky|Asia/Yakutsk=MSK+06 - Lena River|Asia/Khandyga=MSK+06 - Tomponsky, Ust-Maysky|Asia/Vladivostok=MSK+07 - Amur River|Asia/Ust-Nera=MSK+07 - Oymyakonsky|Asia/Magadan=MSK+08 - Magadan|Asia/Sakhalin=MSK+08 - Sakhalin Island|Asia/Srednekolymsk=MSK+08 - Sakha (E), N Kuril Is|Asia/Kamchatka=MSK+09 - Kamchatka|Asia/Anadyr=MSK+09 - Bering Sea
RW;Rwanda;Africa/Kigali
SA;Saudi Arabia;Asia/Riyadh
SB;Solomon Islands;Pacific/Guadalcanal
SC;Seychelles;Indian/Mahe
SD;Sudan;Africa/Khartoum
SE;Sweden;Europe/Stockholm
SG;Singapore;Asia/Singapore
SH;St Helena;Atlantic/St_Helena
SI;Slovenia;Europe/Ljubljana
SJ;Svalbard & Jan Mayen;Arctic/Longyearbyen
SK;Slovakia;Europe/Bratislava
SL;Sierra Leone;Africa/Freetown
SM;San Marino;Europe/San_Marino
SN;Senegal;Africa/Dakar
SO;Somalia;Africa/Mogadishu
SR;Suriname;America/Paramaribo
SS;South Sudan;Africa/Juba
ST;Sao Tome & Principe;Africa/Sao_Tome
SV;El Salvador;America/El_Salvador
SX;St Maarten (Dutch);America/Lower_Princes
SY;Syria;Asia/Damascus
SZ;Eswatini (Swaziland);Africa/Mbabane
TC;Turks & Caicos Is;America/Grand_Turk
TD;Chad;Africa/Ndjamena
TF;French S. Terr.;Indian/Kerguelen
TG;Togo;Africa/Lome
TH;Thailand;Asia/Bangkok
TJ;Tajikistan;Asia/Dushanbe
TK;Tokelau;Pacific/Fakaofo
TL;East Timor;Asia/Dili
TM;Turkmenistan;Asia/Ashgabat
TN;Tunisia;Africa/Tunis
TO;Tonga;Pacific/Tongatapu
TR;Turkey;Europe/Istanbul
TT;Trinidad & Tobago;America/Port_of_Spain
TV;Tuvalu;Pacific/Funafuti
TW;Taiwan;Asia/Taipei
TZ;Tanzania;Africa/Dar_es_Salaam
UA;Ukraine;Europe/Simferopol=Crimea|Europe/Kyiv=most of Ukraine
UG;Uganda;Africa/Kampala
UM;US minor outlying islands;Pacific/Midway=Midway Islands|Pacific/Wake=Wake Island
US;United States;America/New_York=Eastern (most areas)|America/Detroit=Eastern - MI (most areas)|America/Kentucky/Louisville=Eastern - KY (Louisville area)|America/Kentucky/Monticello=Eastern - KY (Wayne)|America/Indiana/Indianapolis=Eastern - IN (most areas)|America/Indiana/Vincennes=Eastern - IN (Da, Du, K, Mn)|America/Indiana/Winamac=Eastern - IN (Pulaski)|America/Indiana/Marengo=Eastern - IN (Crawford)|America/Indiana/Petersburg=Eastern - IN (Pike)|America/Indiana/Vevay=Eastern - IN (Switzerland)|America/Chicago=Central (most areas)|America/Indiana/Tell_City=Central - IN (Perry)|America/Indiana/Knox=Central - IN (Starke)|America/Menominee=Central - MI (Wisconsin border)|America/North_Dakota/Center=Central - ND (Oliver)|America/North_Dakota/New_Salem=Central - ND (Morton rural)|America/North_Dakota/Beulah=Central - ND (Mercer)|America/Denver=Mountain (most areas)|America/Boise=Mountain - ID (south), OR (east)|America/Phoenix=MST - AZ (except Navajo)|America/Los_Angeles=Pacific|America/Anchorage=Alaska (most areas)|America/Juneau=Alaska - Juneau area|America/Sitka=Alaska - Sitka area|America/Metlakatla=Alaska - Annette Island|America/Yakutat=Alaska - Yakutat|America/Nome=Alaska (west)|America/Adak=Alaska - western Aleutians|Pacific/Honolulu=Hawaii
UY;Uruguay;America/Montevideo
UZ;Uzbekistan;Asia/Samarkand=Uzbekistan (west)|Asia/Tashkent=Uzbekistan (east)
VA;Vatican City;Europe/Vatican
VC;St Vincent;America/St_Vincent
VE;Venezuela;America/Caracas
VG;Virgin Islands (UK);America/Tortola
VI;Virgin Islands (US);America/St_Thomas
VN;Vietnam;Asia/Ho_Chi_Minh
VU;Vanuatu;Pacific/Efate
WF;Wallis & Futuna;Pacific/Wallis
WS;Samoa (western);Pacific/Apia
YE;Yemen;Asia/Aden
YT;Mayotte;Indian/Mayotte
ZA;South Africa;Africa/Johannesburg
ZM;Zambia;Africa/Lusaka
ZW;Zimbabwe;Africa/Harare
`.trim();

const COUNTRIES = DATA.split('\n').map((line) => {
  const [code, name, zoneList] = line.split(';');
  const zones = zoneList.split('|').map((z) => {
    const [tz, note = ''] = z.split('=');
    return { tz, note };
  });
  return { code, name, zones };
});

function zoneNow(tz, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', timeZoneName: 'shortOffset',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    offset: parts.timeZoneName.replace('GMT', 'UTC') || 'UTC',
  };
}

function apiTime() {
  const now = new Date();
  return {
    utc: now.toISOString(),
    countries: COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      zones: c.zones.map((z) => {
        try { return { tz: z.tz, note: z.note, ...zoneNow(z.tz, now) }; }
        catch { return { tz: z.tz, note: z.note, error: 'unknown time zone' }; }
      }),
    })),
  };
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>World Clock</title>
<style>
  :root {
    --bg: #f4f5f7; --card: #fff; --text: #16181d; --muted: #6b7180; --line: #e2e4e9;
    --accent: #2563eb; --day: #fff7e0; --night: #e9ecf7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --card: #181b22; --text: #e8eaf0; --muted: #8b92a3; --line: #2a2f3a;
      --accent: #6ea0ff; --day: #2a2617; --night: #161a2b;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line);
    padding: 12px 16px; }
  .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0; }
  #here { color: var(--muted); font-variant-numeric: tabular-nums; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; max-width: 1200px; margin: 10px auto 0; }
  input, select, button { font: inherit; color: var(--text); background: var(--card); border: 1px solid var(--line);
    border-radius: 8px; padding: 8px 10px; }
  input { flex: 1 1 220px; min-width: 0; }
  button { cursor: pointer; }
  #count { color: var(--muted); align-self: center; font-size: 13px; }
  main { max-width: 1200px; margin: 0 auto; padding: 16px; display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .card.day { background: linear-gradient(var(--day), var(--card) 70%); }
  .card.night { background: linear-gradient(var(--night), var(--card) 70%); }
  .name { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .flag { font-size: 22px; line-height: 1; }
  .code { margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 500; }
  .time { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 6px; }
  .meta { color: var(--muted); font-size: 13px; }
  details { margin-top: 8px; border-top: 1px solid var(--line); padding-top: 6px; }
  summary { cursor: pointer; color: var(--accent); font-size: 13px; }
  .zone { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 3px 0;
    font-variant-numeric: tabular-nums; }
  .zone span:first-child { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .zone span:last-child { white-space: nowrap; }
  .empty { grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px 0; }
</style>
</head>
<body>
<header>
  <div class="top"><h1>🌍 World Clock</h1><span id="here"></span></div>
  <div class="controls">
    <input id="q" type="search" placeholder="Search country, code or city…" autocomplete="off">
    <select id="sort">
      <option value="name">Sort: A–Z</option>
      <option value="time">Sort: earliest → latest</option>
      <option value="time-desc">Sort: latest → earliest</option>
    </select>
    <button id="fmt" type="button">24h</button>
    <span id="count"></span>
  </div>
</header>
<main id="grid"></main>
<script>
const COUNTRIES = __COUNTRIES__;
const grid = document.getElementById('grid');
const q = document.getElementById('q');
const sortSel = document.getElementById('sort');
const fmtBtn = document.getElementById('fmt');
const count = document.getElementById('count');
const here = document.getElementById('here');

let h12 = false;
try { h12 = localStorage.getItem('wc-h12') === '1'; } catch {}
let clockSkew = 0; // server time minus device time, so a wrong phone clock still shows the right times

const flag = (code) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));

const formatters = new Map();
function fmtFor(tz) {
  const key = tz + h12;
  if (!formatters.has(key)) {
    try {
      formatters.set(key, new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour12: h12, hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', day: 'numeric', month: 'short', timeZoneName: 'shortOffset',
      }));
    } catch { formatters.set(key, null); }
  }
  return formatters.get(key);
}

function read(tz, now) {
  const f = fmtFor(tz);
  if (!f) return null;
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const offset = (p.timeZoneName || 'GMT').replace('GMT', 'UTC');
  const m = offset.match(/UTC([+-])(\\d+)(?::(\\d+))?/);
  const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  const hour24 = (now.getUTCHours() * 60 + now.getUTCMinutes() + mins + 1440 * 2) % 1440 / 60;
  return {
    time: p.hour + ':' + p.minute + ':' + p.second + (p.dayPeriod ? ' ' + p.dayPeriod.toUpperCase() : ''),
    date: p.weekday + ' ' + p.day + ' ' + p.month,
    offset: offset === 'UTC' ? 'UTC±0' : offset,
    mins, hour24,
  };
}

// Build the cards once; the clock only updates text.
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
for (const c of COUNTRIES) {
  c.search = (c.name + ' ' + c.code + ' ' + c.zones.map((z) => z.tz + ' ' + z.note).join(' '))
    .toLowerCase().replace(/_/g, ' ');
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML =
    '<div class="name"><span class="flag">' + flag(c.code) + '</span><span>' + esc(c.name) +
    '</span><span class="code">' + c.code + '</span></div>' +
    '<div class="time"></div><div class="meta"></div>' +
    (c.zones.length > 1
      ? '<details><summary>' + c.zones.length + ' time zones</summary>' +
        c.zones.map((z) => '<div class="zone"><span title="' + esc(z.tz) + '">' +
          esc(z.note || z.tz.split('/').pop().replace(/_/g, ' ')) + '</span><span></span></div>').join('') +
        '</details>'
      : '');
  c.el = el;
  c.timeEl = el.querySelector('.time');
  c.metaEl = el.querySelector('.meta');
  c.zoneEls = [...el.querySelectorAll('.zone span:last-child')];
}

function tick() {
  const now = new Date(Date.now() + clockSkew);
  here.textContent = 'Your time: ' + now.toLocaleTimeString([], { hour12: h12 }) + ' · UTC ' + now.toISOString().slice(11, 19);
  for (const c of COUNTRIES) {
    const reads = c.zones.map((z) => read(z.tz, now));
    const main = reads[0];
    if (!main) { c.timeEl.textContent = '—'; c.metaEl.textContent = 'Time zone not supported by this browser'; continue; }
    c.sortKey = main.mins;
    c.timeEl.textContent = main.time;
    let meta = main.date + ' · ' + main.offset;
    const offs = [...new Set(reads.filter(Boolean).map((r) => r.mins))];
    if (offs.length > 1) {
      const lo = reads.find((r) => r && r.mins === Math.min(...offs));
      const hi = reads.find((r) => r && r.mins === Math.max(...offs));
      meta = main.date + ' · ' + lo.offset + ' to ' + hi.offset;
    }
    c.metaEl.textContent = (main.hour24 >= 6 && main.hour24 < 18 ? '☀️ ' : '🌙 ') + meta;
    c.el.classList.toggle('day', main.hour24 >= 6 && main.hour24 < 18);
    c.el.classList.toggle('night', !(main.hour24 >= 6 && main.hour24 < 18));
    c.zoneEls.forEach((span, i) => { span.textContent = reads[i] ? reads[i].time + ' · ' + reads[i].offset : '—'; });
  }
}

function render() {
  const terms = q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
  const list = COUNTRIES.filter((c) => terms.every((t) => c.search.includes(t)));
  const s = sortSel.value;
  if (s !== 'name') list.sort((a, b) => (s === 'time' ? 1 : -1) * (a.sortKey - b.sortKey) || a.name.localeCompare(b.name));
  grid.replaceChildren(...list.map((c) => c.el));
  if (!list.length) grid.innerHTML = '<div class="empty">No country matches “' + esc(q.value) + '”</div>';
  count.textContent = list.length + ' of ' + COUNTRIES.length + ' countries';
}

q.addEventListener('input', render);
sortSel.addEventListener('change', render);
fmtBtn.textContent = h12 ? '12h' : '24h';
fmtBtn.addEventListener('click', () => {
  h12 = !h12;
  fmtBtn.textContent = h12 ? '12h' : '24h';
  try { localStorage.setItem('wc-h12', h12 ? '1' : '0'); } catch {}
  tick();
});

tick();
render();
// Re-sort only on minute boundaries so the grid does not jump around every second.
let lastMinute = -1;
setInterval(() => {
  tick();
  const m = new Date(Date.now() + clockSkew).getUTCMinutes();
  if (m !== lastMinute) { if (sortSel.value !== 'name' && lastMinute !== -1) render(); lastMinute = m; }
}, 1000);

const t0 = Date.now();
fetch('/api/time').then((r) => r.json()).then((d) => {
  const rtt = Date.now() - t0;
  clockSkew = Date.parse(d.utc) + rtt / 2 - Date.now();
  if (Math.abs(clockSkew) < 1000) clockSkew = 0;
  tick();
}).catch(() => {});
</script>
</body>
</html>`.replace(
  '__COUNTRIES__',
  () => JSON.stringify(COUNTRIES).replace(/</g, '\\u003c'),
);

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(PAGE);
  } else if (pathname === '/api/time') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(apiTime()));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`World Clock: ${COUNTRIES.length} countries at http://localhost:${PORT}`);
});

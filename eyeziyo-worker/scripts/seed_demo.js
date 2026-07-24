#!/usr/bin/env node
/**
 * Generates a SQL seed file for the Eyeziyo demo:
 * - Converts the existing institution to a fully populated university
 * - Faculties, directions, course years, groups
 * - 10 teachers, ~60 students (legacy SHA-256 password "demo1234")
 * - Subjects, teacher/student assignments
 * - 60+ lessons across the last 60 days, each with a realistic Uzbek transcript
 * - Matching AI evaluations (scores + summary + strengths/improvements/advice)
 * - Lesson tests (questions + key terms) so the Mentor app has content
 * - Test attempts and mentor chats so analytics aren't empty
 *
 * Usage: node scripts/seed_demo.js > scripts/seed_demo.sql
 *
 * IDs are explicit so all foreign keys can be wired in a single batch run.
 * Demo password hash is the legacy SHA-256 format the worker still verifies;
 * users will be auto-rehashed to PBKDF2 on first successful login.
 */

const PASSWORD = "demo1234";
const PASSWORD_HASH = "d11612149293e4f47fcfcce1491759e3033e27da38aca12bf900cd50b101ae19";
const INSTITUTION_ID = 1;

// ID offsets — chosen well above any pre-existing rows so explicit inserts
// never collide with auto-increment leftovers.
const TEACHER_ID_BASE = 1000;
const STUDENT_ID_BASE = 1100;
const NODE_ID_BASE = 100;
const SUBJECT_ID_BASE = 500;
const GROUP_ID_BASE = 300;
const LESSON_ID_BASE = 1000;

// ──────────────────────────────────────────────────────────────────────
// CORPUS
// ──────────────────────────────────────────────────────────────────────

const TEACHERS = [
  { name: "Axmedov Sherzod",          email: "axmedov.sh@eyeziyo.uz",      avatar: "AS", subject: "Dasturlash asoslari" },
  { name: "Karimova Nigora",          email: "karimova.n@eyeziyo.uz",      avatar: "KN", subject: "Algoritmlar va ma'lumotlar tuzilmalari" },
  { name: "Yusupov Bekzod",           email: "yusupov.b@eyeziyo.uz",       avatar: "YB", subject: "Veb dasturlash" },
  { name: "Toshmuhammedov Otabek",    email: "toshmuhammedov.o@eyeziyo.uz",avatar: "TO", subject: "Mobil dasturlash" },
  { name: "Rahimova Maftuna",         email: "rahimova.m@eyeziyo.uz",      avatar: "RM", subject: "Sun'iy intellekt asoslari" },
  { name: "Salimov Davron",           email: "salimov.d@eyeziyo.uz",       avatar: "SD", subject: "Mashinaviy o'rganish" },
  { name: "Nazarova Dilnoza",         email: "nazarova.d@eyeziyo.uz",      avatar: "ND", subject: "Operatsion tizimlar" },
  { name: "Xolmatov Jamshid",         email: "xolmatov.j@eyeziyo.uz",      avatar: "XJ", subject: "Diskret matematika" },
  { name: "Sultonov Aziz",            email: "sultonov.a@eyeziyo.uz",      avatar: "SA", subject: "Iqtisodiyot nazariyasi" },
  { name: "Mirzaev Anvar",            email: "mirzaev.a@eyeziyo.uz",       avatar: "MA", subject: "Loyihalarni boshqarish" },
];

// Realistic Uzbek student names (60). Alternating male/female for diversity.
const STUDENT_NAMES = [
  "Abdullayev Sardor",      "Karimova Nigina",       "Yusupov Mansur",         "Tojiboyeva Madina",
  "Rashidov Otabek",        "Mirzayeva Zilola",      "Saidov Bekjon",          "Olimova Kamola",
  "Xolmurodov Akbar",       "Nazirova Sevara",       "Yormatov Akmal",         "Xodjayeva Shahnoza",
  "Tursunov Doniyor",       "Rasulova Munisa",       "Eshmatov Jasur",         "Niyozova Gulnora",
  "Komilov Bobur",          "Sodiqova Dilbar",       "Salimov Aziz",           "Yuldasheva Mavluda",
  "Inomov Sherali",         "Karimova Maftuna",      "Bobomurodov Rustam",     "Kuziyeva Shahzoda",
  "Murodov Abdulaziz",      "Aliyeva Nigora",        "Xodjayev Faxriddin",     "Toshmurodova Nilufar",
  "Sobirov Ikrom",          "Rahmonova Iroda",       "Atayev Bahodir",         "Saidova Madina",
  "Mansurov Javohir",       "Ergasheva Munira",      "Boqiyev Ulug'bek",       "Xolmatova Dilnoza",
  "Nematov Jahongir",       "Yusupova Sevinch",      "Xayriddinov Zafar",      "Toshpulatova Aziza",
  "Akbarov Sherzod",        "Mirzaeva Maxliyo",      "Davronov Asror",         "Komilova Husnida",
  "Yormamatov Rasul",       "Berdiqulova Rayhona",   "Tashkenboyev Bekzod",    "Xudoyberganova Sadoqat",
  "Allayorov Botir",        "Norqulova Dilfuza",     "Sherqulov Sherzod",      "Nuriddinova Hilola",
  "Shukurov Bobomurod",     "Ibragimova Zarnigor",   "Hamidov Sanjar",         "Olimova Marjona",
  "Karimov Iskandar",       "Salimova Yulduz",       "Egamberdiyev Eldor",     "Akbarova Shaxnoza",
];

const SUBJECTS_DEF = [
  { name: "Dasturlash asoslari",                   short: "DA",   credits: 4 },
  { name: "Algoritmlar va ma'lumotlar tuzilmalari",short: "AMT",  credits: 4 },
  { name: "Ma'lumotlar bazalari",                  short: "MB",   credits: 3 },
  { name: "Veb dasturlash",                        short: "VD",   credits: 4 },
  { name: "Mobil dasturlash",                      short: "MD",   credits: 3 },
  { name: "Sun'iy intellekt asoslari",             short: "SIA",  credits: 3 },
  { name: "Mashinaviy o'rganish",                  short: "MO",   credits: 4 },
  { name: "Operatsion tizimlar",                   short: "OT",   credits: 3 },
  { name: "Kompyuter tarmoqlari",                  short: "KT",   credits: 3 },
  { name: "Diskret matematika",                    short: "DM",   credits: 3 },
  { name: "Iqtisodiyot nazariyasi",                short: "IN",   credits: 3 },
  { name: "Loyihalarni boshqarish",                short: "LB",   credits: 2 },
];

// Subject -> teacher mapping (by index into TEACHERS / SUBJECTS_DEF)
const SUBJECT_TEACHER = {
  0: [0],         // DA           -> Axmedov
  1: [1],         // AMT          -> Karimova
  2: [1, 6],      // MB           -> Karimova, Nazarova
  3: [2],         // VD           -> Yusupov
  4: [3],         // MD           -> Toshmuhammedov
  5: [4],         // SIA          -> Rahimova
  6: [4, 5],      // MO           -> Rahimova, Salimov
  7: [6],         // OT           -> Nazarova
  8: [6],         // KT           -> Nazarova
  9: [7],         // DM           -> Xolmatov
  10: [8],        // IN           -> Sultonov
  11: [9],        // LB           -> Mirzaev
};

// Hierarchy: faculty -> direction -> course years
const FACULTIES = [
  {
    name: "Kompyuter injineringi", short: "KI",
    directions: [
      { name: "Dasturiy injineriya", short: "DI", years: 4, groupsPerYear: { 1: 2, 2: 2, 3: 1, 4: 1 } },
      { name: "Sun'iy intellekt",    short: "SI", years: 2, groupsPerYear: { 1: 1, 2: 1 } },
    ],
  },
  {
    name: "Telekommunikatsiya texnologiyalari", short: "TT",
    directions: [
      { name: "Mobil aloqa", short: "MA", years: 2, groupsPerYear: { 1: 1, 2: 1 } },
    ],
  },
  {
    name: "Iqtisodiyot va menejment", short: "EM",
    directions: [
      { name: "Raqamli iqtisodiyot", short: "RI", years: 2, groupsPerYear: { 1: 1, 2: 1 } },
    ],
  },
];

// Per-subject lecture transcript templates. Each is a realistic 3-5 paragraph
// Uzbek lecture excerpt that the AI evaluator would actually score.
const TRANSCRIPTS = {
  "Dasturlash asoslari": [
    `Salom o'quvchilar. Bugungi darsimizda biz o'zgaruvchilar va ularning turlari haqida gaplashamiz. O'zgaruvchi — bu ma'lumotni saqlash uchun nomli xotira maydoni. Python tilida o'zgaruvchini e'lon qilish uchun ismni yozib, teng belgisidan keyin qiymatni kiritamiz.

Misol uchun: yosh = 20. Bu yerda yosh degan o'zgaruvchiga 20 qiymati berildi. Endi keling turlarga e'tibor beraylik. Asosan to'rtta turdagi ma'lumot bor: int — butun sonlar, float — kasr sonlar, str — matn, va bool — rost yoki yolg'on qiymatlar.

Type funksiyasi orqali o'zgaruvchining turini bilib olishimiz mumkin. Print(type(yosh)) deb yozsak, ekranda class int chiqadi. Bu Python avtomatik ravishda turini aniqlaganini ko'rsatadi.

Endi sizga vazifa: o'z ismingiz va yoshingizni ifodalaydigan ikki o'zgaruvchi yarating va ekranga chiqaring. Keyingi darsda biz shartli operatorlarni o'rganamiz.`,

    `Bugun shartli operatorlar mavzusiga to'xtalamiz. Dastur har doim chiziqli bajarilmaydi — ba'zan biz uning yo'nalishini boshqarishimiz kerak. Buning uchun if konstruksiyasidan foydalanamiz.

Sintaksisi juda oddiy: if shart, keyin ikki nuqta, va keyingi qatorda tabulyatsiya bilan bajariladigan kod. Misol: if yosh >= 18: print("Voyaga yetgan"). Agar shart bajarilmasa, else bloki ishlaydi.

Bir nechta shartlarni tekshirish uchun elif kalit so'zi bor. Masalan: if score >= 90 print("a'lo"), elif score >= 70 print("yaxshi"), else print("qoniqarli"). Ushbu konstruksiya darslar bahosini aniqlash uchun ko'p ishlatiladi.

Operator and, or, not yordamida murakkab shartlar tuzish mumkin. Eslatib o'taman: Python da indentatsiya juda muhim — agar bo'shliqlar to'g'ri qo'yilmasa, dastur xato beradi.`,

    `Funksiyalar — bu kodni qayta ishlatish uchun asosiy vosita. def kalit so'zi bilan funksiyani aniqlaymiz. Argumentlar qavslar ichida, return orqali qiymat qaytariladi.

Misol uchun, ikki sonni qo'shadigan funksiya: def yigindi(a, b): return a + b. Endi bu funksiyani istalgan joyda chaqirsak bo'ladi: natija = yigindi(5, 3). Bu yerda 8 qaytariladi.

Default argumentlar ham mavjud. Agar argument berilmasa, default qiymat ishlatiladi. Misol: def salom(ism="dunyo"): print("Salom", ism). Salom() chaqirilganda "Salom dunyo" chiqadi.

Funksiya nomlari mazmunli bo'lishi kerak. yigindi, ko_paytma, foiz_hisobla — bularning hammasi yaxshi nomlar. f1, x, abc — yomon nomlar. Yaxshi kod yozish — bu o'qilishi oson kod yozish.`,
  ],

  "Algoritmlar va ma'lumotlar tuzilmalari": [
    `Bugungi mavzuimiz — Big O notatsiyasi. Algoritmni baholash uchun biz uning vaqt va xotira murakkabligini hisoblashimiz kerak. Big O — bu eng yomon holat uchun o'sish darajasini ifodalovchi notatsiya.

O(1) — doimiy vaqt, kirish hajmiga bog'liq emas. Misol: massiv elementiga indeks orqali murojaat. O(n) — chiziqli, kirish hajmiga to'g'ri proporsional. Misol: massivda elementni qidirish.

O(log n) — logarifmik, juda samarali. Klassik misol: ikki bo'lakka bo'lib qidirish (binary search). O(n log n) — yaxshi saralash algoritmlari, masalan merge sort. O(n²) — bubble sort kabi sodda algoritmlar.

Amaliyotda O(n²) algoritmlar 10 ming elementdan ortiq ma'lumotda sezilarli sekinlashadi. Shuning uchun har doim algoritmni tahlil qilib, samaraliroq variantni izlash kerak. Keyingi darsda biz ikki bo'lakka bo'lish algoritmini batafsil ko'rib chiqamiz.`,

    `Stack va Queue — eng asosiy ma'lumotlar tuzilmalari. Stack LIFO printsipida ishlaydi: oxirgi qo'yilgan element birinchi olinadi. Aslida bu plitalar uyumiga o'xshaydi.

Stack uchun ikkita asosiy operatsiya: push — element qo'shish, pop — eng yuqorisini olib tashlash. Ikkalasi ham O(1) vaqtda bajariladi. Foydalanish misollari: brauzerda back tugmasi, undo funksiyasi, qavslarni tekshirish.

Queue esa FIFO: birinchi kelgan birinchi xizmat oladi. Operatsiyalar: enqueue va dequeue. Foydalanish: printer navbati, BFS algoritmi, vazifalar rejalashtiruvchisi.

Python da stack uchun ro'yxat (list) ishlatish mumkin: append va pop. Queue uchun esa collections.deque tavsiya etiladi — chunki ro'yxatda boshidan element olib tashlash O(n) vaqt oladi, deque esa O(1) ta'minlaydi.`,
  ],

  "Veb dasturlash": [
    `Bugun biz HTTP protokolining asoslarini ko'rib chiqamiz. HTTP — bu mijoz va server o'rtasidagi muloqot tili. Brauzer so'rov yuboradi, server javob beradi.

So'rovning uchta asosiy qismi bor: metod, URL, va headerlar. Eng ko'p ishlatiladigan metodlar: GET — ma'lumot olish, POST — yangi ma'lumot yuborish, PUT — yangilash, DELETE — o'chirish. Bularning to'plami RESTful API ning asosini tashkil qiladi.

Status kodlar javobning natijasini bildiradi. 200 — muvaffaqiyat, 201 — yaratildi, 404 — topilmadi, 401 — autentifikatsiya kerak, 500 — server xatosi. Yaxshi API har doim to'g'ri status kod qaytarishi shart.

Bugun amaliy mashq sifatida fetch funksiyasi orqali oddiy API'dan ma'lumot olib, sahifada ko'rsatamiz. JSON formati zamonaviy veb da standart hisoblanadi.`,

    `React komponentlari haqida gaplashamiz. Komponent — bu UI ning qayta ishlatiladigan qismi. Function komponent eng zamonaviy yondashuv hisoblanadi.

Props orqali komponentga ma'lumot uzatamiz: function Welcome(props) return Salom props.ism. State esa komponentning ichki holati. useState hook orqali boshqarsamiz: const [son setSon] = useState(0).

Komponentlar bir-biriga joylashishi mumkin. Bu kompozitsiya prinsipi. Asosiy ilova App komponenti bo'lib, uning ichida Header, Main, Footer komponentlari bo'lishi mumkin. Har bir komponent o'z mas'uliyatiga ega.

useEffect hook side effect lar uchun ishlatiladi: API chaqiruvi, eventListener qo'shish, timer. Dependency array orqali qachon ishga tushishini boshqarsamiz. Bo'sh massiv [] berilsa, faqat bir marta — komponent yuklanganda ishlaydi.`,
  ],

  "Mobil dasturlash": [
    `Android Compose — bu zamonaviy UI yaratish texnologiyasi. XML layout o'rniga biz Kotlin tilida deklarativ tarzda interfeysni tasvirlaymiz.

@Composable annotatsiyasi orqali funksiyalar yaratamiz. Misol: Text("Salom"), Button(onClick = ...), Column { Text(...); Text(...) }. State o'zgartirilganda UI avtomatik qayta render bo'ladi.

Modifier orqali ko'rinishni o'zgartiramiz: padding, background, clickable. Modifier zanjiri tartibi muhim — masalan padding(16.dp).background(Red) va background(Red).padding(16.dp) farqli natija beradi.

remember va mutableStateOf state boshqarish uchun. var count by remember mutableStateOf(0) — bu o'zgartirilganda UI yangilanadi. Ko'p ishlatiladigan pattern: Hoist state up, ya'ni state ni yuqori komponentga ko'chirish.`,
  ],

  "Sun'iy intellekt asoslari": [
    `Sun'iy intellekt nima va nima emas? Bugun biz aniq belgilab olamiz. AI — bu kompyuter sistemalari odam aql talab qiladigan vazifalarni bajarishi. Lekin bu film kabi sezuvchi mavjudot emas.

AI ning uch katta turi bor: tor AI (narrow) — bitta vazifani bajaruvchi, masalan shaxmat dasturi yoki yuzni tanish. Umumiy AI (AGI) — odam kabi har xil vazifalarni bajarish, hozircha mavjud emas. Super AI — odamdan o'tib ketish, faqat fantastikada.

Bugungi barcha mashhur tizimlar — ChatGPT, Gemini, Midjourney — tor AI. Ular ma'lum vazifaga juda yaxshi javob beradi, lekin tushunish va ong yo'q. Asosida statistika va naqshlarni topish.

Mashinaviy o'rganish — bu AI ni yaratishning asosiy yo'li. Dasturchi qoidalarni yozmaydi, balki misollar beradi va sistema o'zi naqshni topadi. Keyingi darsda biz neyron tarmoqlar haqida gaplashamiz.`,
  ],

  "Mashinaviy o'rganish": [
    `Linear regressiya — eng oddiy va eng asosiy ML algoritm. Maqsadi: kirish (X) va chiqish (y) o'rtasidagi chiziqli bog'liqlikni topish.

Formula: y = wx + b. Bu yerda w og'irlik (slope), b bias (intercept). Ma'lumotlar asosida w va b qiymatlarini topishimiz kerak. Bu uchun yo'qotish funksiyasini (loss function) minimallashtiramiz.

Eng ko'p ishlatiladigan loss — Mean Squared Error: barcha xatolarning kvadratlari o'rtachasi. Gradient descent algoritmi bilan loss ni kamaytiramiz, har qadamda w va b ni biroz o'zgartiramiz.

scikit-learn kutubxonasi bilan amalga oshirish juda oson: from sklearn.linear_model import LinearRegression, model = LinearRegression(), model.fit(X, y). Lekin asosini tushunish muhim — boshqa algoritmlar shu printsipga asoslangan.`,
  ],

  "Operatsion tizimlar": [
    `Operatsion tizim — bu kompyuter resurslarini boshqaruvchi va dasturlarga muhit yaratuvchi dastur. Asosiy funksiyalari: jarayonlarni boshqarish, xotira boshqaruvi, fayl tizimi, qurilmalar bilan ishlash.

Process — bu ishlayotgan dastur. Har bir process o'z manzillar makoniga, register qiymatlariga, va ochiq fayllarga ega. Operatsion tizim bir vaqtning o'zida ko'p processlarni boshqaradi (multitasking).

Scheduler — qaysi process qaysi vaqtda CPU dan foydalanishini hal qiladi. Round-robin algoritmi har bir process ga teng vaqt beradi. Priority based esa muhim processlarga ustunlik beradi.

Thread — process ichidagi yengilroq bajarilish birligi. Bitta process da bir nechta thread bo'lishi mumkin va ular xotirani bo'lishadi. Bu parallel hisoblashni yengillashtiradi, lekin race condition kabi muammolarni keltirib chiqaradi.`,
  ],

  "Kompyuter tarmoqlari": [
    `OSI modeli — tarmoqni tushunish uchun asos. 7 ta qatlamdan iborat: physical, data link, network, transport, session, presentation, application. Har biri o'z vazifasiga ega.

Physical qatlami — kabel, signal, voltaj. Data link — MAC manzillar, Ethernet. Network qatlami — IP manzillar va routing. Transport — TCP yoki UDP, port raqamlari.

TCP — ishonchli aloqa, ma'lumotlar to'liq yetkazilganini ta'minlaydi. UDP — tez lekin ishonchsiz, video oqim va o'yinlar uchun mos. Application qatlami — HTTP, FTP, DNS kabi protokollar.

Amaliyotda har doim 7 qatlamni alohida ko'rmaymiz, lekin muammoni tashxis qilishda OSI modeli yordam beradi. "Ping" ishlamayapti — birinchi physical va data link tekshiriladi. "DNS" muammo — application qatlami.`,
  ],

  "Diskret matematika": [
    `Bugungi mavzu — to'plamlar va ulardagi amallar. To'plam — bu aniq belgilangan obyektlar yig'indisi. A = {1, 2, 3} kabi yoziladi. Element to'plamga tegishli yoki tegishli emas.

Asosiy amallar: birlashma (A∪B) — barcha elementlar; kesishma (A∩B) — umumiy elementlar; ayirma (A\\B) — A da bor lekin B da yo'q; to'ldiruvchi — universal to'plamdagi qolganlar.

Kuchli to'plam (power set) — berilgan to'plamning barcha qism to'plamlari to'plami. Agar A = {a, b} bo'lsa, P(A) = {∅, {a}, {b}, {a,b}}. Ya'ni 2^n ta element bo'ladi.

Vennin diagrammasi to'plam munosabatlarini vizualizatsiya qilish uchun ajoyib vosita. Ikki yoki uchta to'plam uchun yaxshi ishlaydi. Mantiqiy fikrlashda ham qo'l keladi: "barcha A — B" degani A ⊆ B.`,
  ],

  "Iqtisodiyot nazariyasi": [
    `Talab va taklif qonuni — bozor iqtisodiyotining asosi. Talab — xaridorlar ma'lum narxda sotib olishga tayyor bo'lgan miqdor. Taklif — sotuvchilar shu narxda sotishga tayyor miqdor.

Narx oshganda talab odatda kamayadi (ters proportsional). Taklif esa oshadi — sotuvchilar ko'proq daromad olish uchun ko'proq taklif qiladilar. Ikkala chiziq kesishgan nuqta — muvozanat narxi.

Elastiklik — narx o'zgarganda talab qancha o'zgarishini ko'rsatadi. Asosiy mahsulotlar (non, suv) noelastik — narx oshsa ham deyarli xuddi shuncha sotib olinadi. Hashamatli mollar elastik.

Davlat narxlarni belgilashi mumkin: maksimum (tomon) yoki minimum (yer). Lekin bu ko'pincha tanqislikni yoki ortiqcha taklifni keltirib chiqaradi. Erkin bozor odatda samaraliroq, lekin nazoratsiz qoldirish ham xavfli.`,
  ],

  "Ma'lumotlar bazalari": [
    `Bugun normalizatsiya haqida gaplashamiz. Normalizatsiya — bu jadvallarni qayta tashkil etish, ortiqcha ma'lumotni kamaytirish va yaxlitlikni saqlash usulidir.

Birinchi normal forma (1NF): har bir katakda faqat bitta qiymat bo'lishi kerak. Massivlar yoki vergul bilan ajratilgan ro'yxatlar — bu 1NF buzilishi.

Ikkinchi normal forma (2NF): 1NF + barcha bo'lmagan kalit atributlar to'liq tarkibiy kalitga bog'liq bo'lishi kerak. Bu yerda surrogat kalit qo'shish ko'pincha yordam beradi.

Uchinchi normal forma (3NF): 2NF + tranzitiv bog'liqlik bo'lmasligi kerak. Misol: agar talaba_id orqali fakultet_nomi olinayotgan bo'lsa, bu 3NF buzilishi — alohida fakultet jadvali kerak.`,
  ],

  "Loyihalarni boshqarish": [
    `Agile metodologiyasi — bu loyihalarni iterativ tarzda boshqarish yondashuvi. Asoschi 2001-yilda 17 dasturchi yozgan Agile Manifesto.

Asosiy printsiplar: shaxslar va munosabatlar — jarayonlar va vositalardan muhim; ishlaydigan dastur — to'liq hujjatdan muhim; mijoz bilan hamkorlik — shartnomadan muhim; o'zgarishlarga moslashish — rejani qattiq amal qilishdan muhim.

Scrum — Agile ning eng mashhur amalga oshirilishi. Sprint deb ataladigan 2-4 haftalik sikllarda ishlaymiz. Har sprint oxirida ishlaydigan mahsulotning qismi tayyor bo'lishi kerak.

Asosiy rollar: Product Owner — nima qilish kerakligini aniqlaydi; Scrum Master — jarayonni boshqaradi; Development Team — qiladi. Daily standup, sprint planning, sprint review, retrospective — asosiy uchrashuvlar.`,
  ],
};

// Reusable evaluation snippet pools — picked at random per lesson
const STRENGTHS = [
  "Mavzu aniq va izchil yoritildi.",
  "Misollar amaliy va o'quvchilarga tushunarli.",
  "O'qituvchi savollarga aniq javob berdi.",
  "Ovoz baland va aniq, jaranglashi yaxshi.",
  "Tushunchalar bosqichma-bosqich oddiydan murakkabga qarab tushuntirildi.",
  "Real hayotdagi misollar yordamida nazariya mustahkamlandi.",
  "O'quvchilar bilan o'zaro muloqot yaxshi tashkil etilgan.",
  "Vizual yoki yozma misollar kontsentratsiyaga yordam berdi.",
];
const IMPROVEMENTS = [
  "Tezlikni biroz pasaytirish — ayrim joylar tez o'tib ketdi.",
  "Ko'proq amaliy mashqlar berilsa yaxshi bo'lardi.",
  "O'quvchilarga savollar berib qatnashtirish keng bo'lishi kerak.",
  "Tushuntirish boshlanishida darsning maqsadi aniq aytilishi kerak.",
  "Murakkab atamalar uchun qisqacha takror berib turish foydali.",
  "Yozma misollarni daftar yoki taxta orqali ko'rsatish.",
  "Dars oxirida qisqa xulosa va kalit fikrlarni qaytarish.",
];
const ADVICE = [
  "Har dars boshida 1-2 daqiqa o'tgan darsni qaytarish — yaxshi natija beradi.",
  "Tinglovchilarga 5-7 daqiqada bir savol berish — diqqatni saqlaydi.",
  "Muhim atamalarni taxtaga yozib qo'yish — eslab qolishni osonlashtiradi.",
  "Real loyiha yoki amaliy vazifa qo'shish — motivatsiyani oshiradi.",
  "Eng oddiy misoldan boshlab keyingi qadamga o'tish — barcha o'quvchilar bilan bir tezlikda yurishga yordam beradi.",
  "Darsda Q&A vaqti aniq belgilash — talabalar savol berishdan tortinmasin.",
  "Uy vazifasi sifatida 2-3 ta savol berish va keyingi darsda ko'rib chiqish.",
];

const SUMMARIES = {
  high: [
    "Dars yaxshi tashkil etilgan, mavzu chuqur va aniq yoritilgan. O'quvchilar bilan muloqot mustahkam.",
    "Mazmun va shaklning yaxshi muvozanati. Misollar mavzuni qo'llab-quvvatlaydi.",
    "Pedagogik jihatdan kuchli dars. Kichik takomillashtirishlar bilan a'lo bo'lishi mumkin.",
  ],
  mid: [
    "Dars umumiy ma'noda yaxshi olib borildi, lekin amaliy qism va o'quvchilarni jalb qilish kuchaytirilishi kerak.",
    "Asosiy mavzu yetkazildi, lekin tushuntirishda ba'zi joylar tezroq o'tib ketdi.",
    "O'rtacha sifatdagi dars — mavzu qamrab olindi, lekin o'quvchilar reaktsiyasiga ko'p e'tibor berilmadi.",
  ],
  low: [
    "Mavzu yetarlicha chuqur ochilmadi. Misollar va amaliy mashqlar yetishmadi.",
    "Dars sxematik o'tdi — o'quvchilar bilan muloqot deyarli yo'q edi.",
    "Tushuntirish nomuvofiq, ba'zi muhim joylar o'tkazib yuborildi.",
  ],
};

// Mentor app: per-subject quiz seed (3 questions + 3 key terms each).
// Used for both lesson_tests and Mentor app's flashcards.
const QUIZ_BANK = {
  "Dasturlash asoslari": {
    questions: [
      { q: "Python da o'zgaruvchi nomini qaysi belgi bilan boshlash mumkin emas?", choices: ["harf", "raqam", "_ (chiziqcha)", "$"], correct: 1 },
      { q: "type(3.14) qanday qiymat qaytaradi?", choices: ["int", "float", "str", "bool"], correct: 1 },
      { q: "Quyidagi shartlardan qaysisi True qaytaradi?", choices: ["5 == '5'", "5 < 3", "10 != 9", "True == False"], correct: 2 },
    ],
    terms: [
      { term: "O'zgaruvchi", explanation: "Ma'lumotni saqlash uchun nomli xotira maydoni." },
      { term: "if", explanation: "Shart bo'yicha kodning bir qismini bajarishga ruxsat beruvchi konstruksiya." },
      { term: "Funksiya", explanation: "Qayta ishlatilishi mumkin bo'lgan kod bloki, def kalit so'zi bilan e'lon qilinadi." },
    ],
  },
  "Algoritmlar va ma'lumotlar tuzilmalari": {
    questions: [
      { q: "Ikki bo'lakka bo'lib qidirish algoritmining murakkabligi qanday?", choices: ["O(n)", "O(log n)", "O(n log n)", "O(n²)"], correct: 1 },
      { q: "Stack qaysi printsipda ishlaydi?", choices: ["FIFO", "LIFO", "Random", "Sorted"], correct: 1 },
      { q: "Bubble sort algoritmining vaqt murakkabligi?", choices: ["O(1)", "O(n)", "O(n log n)", "O(n²)"], correct: 3 },
    ],
    terms: [
      { term: "Big O", explanation: "Algoritmning eng yomon holatdagi o'sish darajasini ifodalovchi notatsiya." },
      { term: "Stack", explanation: "LIFO (last-in, first-out) printsipida ishlaydigan ma'lumotlar tuzilmasi." },
      { term: "Queue", explanation: "FIFO (first-in, first-out) printsipida ishlaydigan ma'lumotlar tuzilmasi." },
    ],
  },
  "Veb dasturlash": {
    questions: [
      { q: "404 status kodi nimani anglatadi?", choices: ["Server xatosi", "Topilmadi", "Muvaffaqiyat", "Qayta yo'naltirish"], correct: 1 },
      { q: "Ma'lumot yuborish uchun qaysi HTTP metodi ishlatiladi?", choices: ["GET", "DELETE", "POST", "HEAD"], correct: 2 },
      { q: "useState hook qaysi kutubxonaga tegishli?", choices: ["Vue", "Angular", "React", "Svelte"], correct: 2 },
    ],
    terms: [
      { term: "REST", explanation: "HTTP metodlari yordamida resurslarni boshqaruvchi arxitektura uslubi." },
      { term: "JSON", explanation: "JavaScript Object Notation — zamonaviy veb da standart ma'lumot formati." },
      { term: "Komponent", explanation: "React da UI ning qayta ishlatiladigan, mustaqil qismi." },
    ],
  },
  "Mobil dasturlash": {
    questions: [
      { q: "Compose da UI qaysi tilda yoziladi?", choices: ["XML", "Java", "Kotlin", "Dart"], correct: 2 },
      { q: "@Composable annotatsiyasi nima uchun kerak?", choices: ["Optimallashtirish", "UI funksiyasi ekanini ko'rsatish", "Test uchun", "Logging"], correct: 1 },
      { q: "remember nima qiladi?", choices: ["State ni saqlaydi", "API chaqiradi", "Animation", "Hech nima"], correct: 0 },
    ],
    terms: [
      { term: "Composable", explanation: "UI element yaratuvchi @Composable annotatsiyali Kotlin funksiyasi." },
      { term: "Modifier", explanation: "Compose da ko'rinishni o'zgartirish uchun zanjirli usul." },
      { term: "remember", explanation: "Recomposition oralig'ida state ni saqlab qoluvchi composable yordam funksiyasi." },
    ],
  },
  "Sun'iy intellekt asoslari": {
    questions: [
      { q: "Hozirgi ChatGPT qaysi turdagi AI?", choices: ["Tor (Narrow)", "Umumiy (AGI)", "Super", "Hech qaysi"], correct: 0 },
      { q: "Mashinaviy o'rganish nimaga asoslangan?", choices: ["Qoidalar", "Misollar va naqshlar", "Sehrli formulalar", "Ong"], correct: 1 },
      { q: "Tor AI ning xususiyati?", choices: ["Hamma narsani biladi", "Bitta vazifaga ixtisoslashgan", "Sezuvchi", "Doim to'g'ri javob beradi"], correct: 1 },
    ],
    terms: [
      { term: "AGI", explanation: "Umumiy sun'iy intellekt — odam kabi har xil vazifalarni bajara oladigan tizim (hozircha mavjud emas)." },
      { term: "Tor AI", explanation: "Bitta aniq vazifani bajarishga ixtisoslashgan AI tizimi." },
      { term: "Mashinaviy o'rganish", explanation: "Qoidalarsiz, misollar asosida naqshlarni o'rganadigan AI usuli." },
    ],
  },
  "Mashinaviy o'rganish": {
    questions: [
      { q: "Linear regressiya qanday muammoni hal qiladi?", choices: ["Klassifikatsiya", "Regressiya", "Klasterizatsiya", "Reduktsiya"], correct: 1 },
      { q: "MSE nimani anglatadi?", choices: ["Mean Squared Error", "Multi Sample Estimator", "Median Score Evaluation", "Maximum Standard Error"], correct: 0 },
      { q: "Gradient descent nima qiladi?", choices: ["Ma'lumot yig'adi", "Loss ni minimallashtiradi", "Modelni saqlaydi", "Vizualizatsiya qiladi"], correct: 1 },
    ],
    terms: [
      { term: "Loss funksiyasi", explanation: "Modelning bashorati va haqiqiy qiymatlari orasidagi xatoni o'lchaydi." },
      { term: "Gradient descent", explanation: "Loss funksiyasini iterativ ravishda minimallashtirish algoritmi." },
      { term: "Overfitting", explanation: "Modelning o'qitish ma'lumotini juda yaxshi yodlab, yangi ma'lumotda yomon ishlashi." },
    ],
  },
  "Operatsion tizimlar": {
    questions: [
      { q: "Process nima?", choices: ["Fayl", "Ishlayotgan dastur", "Foydalanuvchi", "Kabel"], correct: 1 },
      { q: "Round-robin scheduling qanday ishlaydi?", choices: ["Tasodifiy", "Har process ga teng vaqt", "Faqat birinchisi", "Hech qachon"], correct: 1 },
      { q: "Thread va process orasidagi farq?", choices: ["Bir xil", "Thread yengilroq", "Process yengilroq", "Hech qanday"], correct: 1 },
    ],
    terms: [
      { term: "Process", explanation: "O'z manzillar makoniga ega ishlayotgan dastur namunasi." },
      { term: "Thread", explanation: "Process ichidagi yengilroq bajarilish birligi, xotirani process bilan bo'lishadi." },
      { term: "Scheduler", explanation: "Qaysi process qaysi vaqtda CPU dan foydalanishini hal qiluvchi OS qismi." },
    ],
  },
  "Kompyuter tarmoqlari": {
    questions: [
      { q: "OSI modelida nechta qatlam bor?", choices: ["5", "6", "7", "8"], correct: 2 },
      { q: "TCP qaysi qatlamga tegishli?", choices: ["Network", "Transport", "Session", "Application"], correct: 1 },
      { q: "DNS nima qiladi?", choices: ["Faylni saqlaydi", "Domen nomini IP ga aylantiradi", "Parolni shifrlaydi", "Email yuboradi"], correct: 1 },
    ],
    terms: [
      { term: "OSI modeli", explanation: "Tarmoq aloqalarini 7 qatlamga ajratuvchi nazariy model." },
      { term: "TCP", explanation: "Ishonchli, ulanishga asoslangan transport protokoli." },
      { term: "DNS", explanation: "Domen nomlarini IP manzillarga aylantiruvchi tarmoq xizmati." },
    ],
  },
  "Diskret matematika": {
    questions: [
      { q: "A∩B nimani anglatadi?", choices: ["Birlashma", "Kesishma", "Ayirma", "To'ldiruvchi"], correct: 1 },
      { q: "{a, b, c} to'plamining kuchli to'plamida nechta element bor?", choices: ["3", "6", "8", "9"], correct: 2 },
      { q: "Bo'sh to'plam (∅) nima?", choices: ["Yo'q to'plam", "Bir element", "Cheksiz", "Universal"], correct: 0 },
    ],
    terms: [
      { term: "To'plam", explanation: "Aniq belgilangan obyektlar yig'indisi." },
      { term: "Birlashma", explanation: "Ikki to'plamning barcha elementlarini o'z ichiga olgan to'plam (A∪B)." },
      { term: "Kesishma", explanation: "Ikki to'plamning umumiy elementlaridan tashkil topgan to'plam (A∩B)." },
    ],
  },
  "Iqtisodiyot nazariyasi": {
    questions: [
      { q: "Talab qonuniga ko'ra narx oshganda talab odatda...", choices: ["Oshadi", "Kamayadi", "O'zgarmaydi", "Yo'qoladi"], correct: 1 },
      { q: "Muvozanat narxi qayerda?", choices: ["Talab eng yuqori joyda", "Taklif eng past joyda", "Talab va taklif kesishgan joyda", "O'rtada"], correct: 2 },
      { q: "Qaysi mahsulot odatda noelastik?", choices: ["Hashamatli avtomobil", "Asosiy oziq-ovqat", "Sayohat", "Telefon"], correct: 1 },
    ],
    terms: [
      { term: "Talab", explanation: "Xaridorlar ma'lum narxda sotib olishga tayyor bo'lgan mahsulot miqdori." },
      { term: "Taklif", explanation: "Sotuvchilar shu narxda sotishga tayyor mahsulot miqdori." },
      { term: "Elastiklik", explanation: "Narx o'zgarishi natijasida talab yoki taklifning o'zgarish darajasi." },
    ],
  },
  "Ma'lumotlar bazalari": {
    questions: [
      { q: "1NF qaysi qoidani talab qiladi?", choices: ["Bir katakda bir qiymat", "Hech narsa", "Ko'p kalit", "Indekslar"], correct: 0 },
      { q: "Tranzitiv bog'liqlik qaysi formani buzadi?", choices: ["1NF", "2NF", "3NF", "BCNF"], correct: 2 },
      { q: "Tarkibiy kalit nechta ustundan tashkil topishi mumkin?", choices: ["Faqat 1", "Faqat 2", "1 yoki ko'p", "Cheksiz"], correct: 2 },
    ],
    terms: [
      { term: "Normalizatsiya", explanation: "Jadvallarni qayta tashkil qilib ortiqlikni kamaytirish jarayoni." },
      { term: "Tarkibiy kalit", explanation: "Bir nechta ustundan tashkil topgan asosiy kalit." },
      { term: "Foreign Key", explanation: "Boshqa jadvalning birlamchi kalitiga havola qiluvchi ustun." },
    ],
  },
  "Loyihalarni boshqarish": {
    questions: [
      { q: "Sprint odatda qancha davom etadi?", choices: ["1 kun", "2-4 hafta", "6 oy", "1 yil"], correct: 1 },
      { q: "Product Owner nimani aniqlaydi?", choices: ["Texnik yechimni", "Nima qilish kerakligini", "Sprint sanasini", "Daily standup vaqtini"], correct: 1 },
      { q: "Daily standup qancha davom etishi kerak?", choices: ["5 daqiqa", "15 daqiqa", "1 soat", "Yarim kun"], correct: 1 },
    ],
    terms: [
      { term: "Sprint", explanation: "Scrum da 2-4 haftalik iterativ ish davri." },
      { term: "Backlog", explanation: "Mahsulot uchun bajarilishi kerak bo'lgan vazifalar ro'yxati." },
      { term: "Retrospective", explanation: "Sprint oxirida nima yaxshi va nimani yaxshilash kerakligini muhokama qilish." },
    ],
  },
};

// Mentor chat seed Q&A pairs (per subject)
const CHAT_SAMPLES = {
  "Dasturlash asoslari": [
    { q: "if va elif farqi nima?", a: "if — birinchi shart, elif — undan keyingi qo'shimcha shartlar. Misol uchun bahoni baholashda: if score >= 90 → 'a'lo', elif score >= 70 → 'yaxshi', else → 'qoniqarli'. Bittadan ortiq elif bo'lishi mumkin." },
    { q: "Funksiyaga default argument qanday beriladi?", a: "Argument nomidan keyin teng belgisi va qiymat: `def salom(ism='dunyo'):`. Endi funksiyani ism bermasdan chaqirsangiz, default 'dunyo' ishlatiladi." },
  ],
  "Algoritmlar va ma'lumotlar tuzilmalari": [
    { q: "Qachon stack ishlatilsa yaxshi?", a: "Oxirgi qo'shilgan elementga birinchi murojaat qilish kerak bo'lganda. Klassik misol: brauzerda 'back' tugmasi, undo funksiyasi, qavslarni tekshirish, va rekursiyani simulyatsiya qilish." },
    { q: "Nega O(n²) yomon?", a: "Kirish hajmi 10 marta oshsa, vaqt 100 marta oshadi. 1000 ta element 1 soniyada bajarilsa, 10000 ta element 100 soniya oladi. Shuning uchun katta ma'lumotda O(n log n) yoki O(n) algoritmlar kerak." },
  ],
  "Veb dasturlash": [
    { q: "REST API nima?", a: "REST — bu HTTP metodlari (GET, POST, PUT, DELETE) yordamida resurslarni boshqaruvchi arxitektura uslubi. Har bir resurs URL ga ega va metodlar uning ustida amal bajaradi: GET /users — ro'yxat olish, POST /users — yangi yaratish." },
    { q: "useEffect qachon ishga tushadi?", a: "Default holatda har render dan keyin. Dependency array berilsa, faqat shu qiymatlar o'zgarganda. Bo'sh array [] berilsa — faqat birinchi render dan keyin (componentDidMount kabi)." },
  ],
  "Sun'iy intellekt asoslari": [
    { q: "ChatGPT qanday ishlaydi?", a: "ChatGPT — bu katta til modeli (LLM) bo'lib, milliardlab matnlarda o'qitilgan. U keyingi so'zni bashorat qilish orqali javob yaratadi. Ya'ni 'tushunish' emas, statistik naqshlarga asoslangan." },
    { q: "AI ish o'rnimni egallaydimi?", a: "Aniq vazifalarni avtomatlashtiradi, lekin ko'p kasblarda — ayniqsa ijodiy, mas'uliyatli yoki murakkab muloqot talab qiladigan — odam kerak qoladi. Eng yaxshi strategiya: AI ni vosita sifatida o'rganish." },
  ],
  "Mashinaviy o'rganish": [
    { q: "Overfitting nima?", a: "Model o'qitish ma'lumotini juda yaxshi yodlab, yangi (ko'rilmagan) ma'lumotda yomon ishlashi. Yechimlar: ko'proq ma'lumot, modelni soddalashtirish, regularizatsiya, cross-validation." },
  ],
  "Operatsion tizimlar": [
    { q: "Process va thread orasidagi farq?", a: "Process — mustaqil dastur, o'z manzillar makoniga ega. Thread — process ichidagi yengilroq birlik, xotirani process bilan bo'lishadi. Threadlar bir-biri bilan tezroq aloqa qiladi, lekin sinxronizatsiya muammolari bor." },
  ],
  "Kompyuter tarmoqlari": [
    { q: "TCP va UDP qachon ishlatish kerak?", a: "TCP — ma'lumot to'liq va tartibida yetib borishi kerak bo'lganda (veb, fayl yuklash, email). UDP — tezlik muhimroq bo'lganda va kichik yo'qotishlar muammo bo'lmaganda (video oqim, o'yinlar, DNS)." },
  ],
  "Mobil dasturlash": [
    { q: "remember va rememberSaveable orasidagi farq?", a: "remember — recomposition oralig'ida state ni saqlaydi. rememberSaveable — bundan tashqari, configuration change (rotation) yoki process death dan keyin ham state ni qaytaradi." },
  ],
  "Diskret matematika": [
    { q: "Kuchli to'plamda nima uchun 2^n element bo'ladi?", a: "Har bir element qism to'plamda yoki bor, yoki yo'q (2 variant). N ta element bo'lsa, 2 × 2 × ... × 2 (n marta) = 2^n ta turli kombinatsiya bo'ladi." },
  ],
  "Iqtisodiyot nazariyasi": [
    { q: "Nega ba'zan davlat narxlarni belgilaydi?", a: "Asosan ijtimoiy maqsadlar uchun: kambag'allarga oziq-ovqat narxini past tutish, ish haqi pastligini oldini olish (minimum ish haqi). Lekin bu ko'pincha tanqislikka yoki qora bozorga olib kelishi mumkin." },
  ],
  "Ma'lumotlar bazalari": [
    { q: "JOIN turlarini tushuntiring", a: "INNER JOIN — ikkala jadvalda mos kelganlarni; LEFT JOIN — chap jadvaldagi hammasini va o'ngdagi mosliklarni; RIGHT JOIN — aksincha; FULL OUTER JOIN — ikkala jadvaldagi hammasini." },
  ],
  "Loyihalarni boshqarish": [
    { q: "Scrum va Kanban orasidagi farq?", a: "Scrum — sprintlar va aniq rollar bilan tuzilgan; har sprint oxirida release. Kanban — uzluksiz oqim, work-in-progress chegarasi bilan; istalgan vaqt release qilinadi. Kichik jamoalarda Kanban moslashuvchanroq." },
  ],
};

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function jsonStr(obj) {
  return sqlStr(JSON.stringify(obj));
}
function pickRand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function isoDateOffset(daysAgo, hoursOffset = null) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  if (hoursOffset != null) {
    d.setHours(hoursOffset, rand(0, 59), 0, 0);
  }
  return d.toISOString().replace("T", " ").substring(0, 19);
}

// ──────────────────────────────────────────────────────────────────────
// GENERATION
// ──────────────────────────────────────────────────────────────────────

const lines = [];
const log = (s) => lines.push(s);

log(`-- Auto-generated demo seed. Re-run scripts/seed_demo.js to regenerate.
-- Password for every demo user (teacher and student): "${PASSWORD}"
-- Admin (id=1) is left untouched.
`);

// 1. Update institution to university type
log(`-- Switch the existing institution to university type with proper metadata`);
log(`UPDATE institutions
SET name = ${sqlStr("Axborot texnologiyalari va menejment universiteti")},
    short_name = ${sqlStr("ATMU")},
    type = ${sqlStr("university")},
    address = ${sqlStr("Toshkent sh., Yunusobod tumani, Mustaqillik shoh ko'chasi 108")},
    phone = ${sqlStr("+998 71 200 99 99")},
    email = ${sqlStr("info@atmu.uz")},
    academic_year = ${sqlStr("2025-2026")},
    updated_at = CURRENT_TIMESTAMP
WHERE id = ${INSTITUTION_ID};`);
log(``);

// 2. Hierarchy nodes
log(`-- ─── HIERARCHY ────────────────────────────────`);
let nodeId = NODE_ID_BASE;
const facultyIds = [];
const directionIds = [];     // [{ id, faculty_id, name, short, years, groupsPerYear }]
const courseNodes = [];      // [{ id, direction_id, year }]

FACULTIES.forEach((fac, fIdx) => {
  const facId = nodeId++;
  facultyIds.push({ id: facId, name: fac.name });
  log(`INSERT INTO hierarchy_nodes (id, institution_id, parent_id, node_type, name, short_name, sort_order) VALUES (${facId}, ${INSTITUTION_ID}, NULL, 'faculty', ${sqlStr(fac.name)}, ${sqlStr(fac.short)}, ${fIdx + 1});`);

  fac.directions.forEach((dir, dIdx) => {
    const dirId = nodeId++;
    directionIds.push({ id: dirId, faculty_id: facId, ...dir });
    log(`INSERT INTO hierarchy_nodes (id, institution_id, parent_id, node_type, name, short_name, sort_order) VALUES (${dirId}, ${INSTITUTION_ID}, ${facId}, 'direction', ${sqlStr(dir.name)}, ${sqlStr(dir.short)}, ${dIdx + 1});`);

    for (let year = 1; year <= dir.years; year++) {
      const courseId = nodeId++;
      courseNodes.push({ id: courseId, direction_id: dirId, year, dirShort: dir.short });
      log(`INSERT INTO hierarchy_nodes (id, institution_id, parent_id, node_type, name, short_name, sort_order) VALUES (${courseId}, ${INSTITUTION_ID}, ${dirId}, 'course', ${sqlStr(year + '-kurs')}, ${sqlStr(year + '-k')}, ${year});`);
    }
  });
});
log(``);

// 3. Groups
log(`-- ─── GROUPS ──────────────────────────────────`);
let groupId = GROUP_ID_BASE;
const groups = [];           // [{ id, name, parent_node_id, dirShort, year }]
courseNodes.forEach((c) => {
  const dir = directionIds.find((d) => d.id === c.direction_id);
  const cnt = dir.groupsPerYear[c.year] || 1;
  for (let i = 1; i <= cnt; i++) {
    const id = groupId++;
    const name = `${c.dirShort}-${c.year}${String(i).padStart(2, "0")}`;
    groups.push({ id, name, parent_node_id: c.id, dirShort: c.dirShort, year: c.year });
    log(`INSERT INTO groups_v2 (id, institution_id, parent_node_id, name, short_name, schedule, start_date) VALUES (${id}, ${INSTITUTION_ID}, ${c.id}, ${sqlStr(name)}, ${sqlStr(name)}, ${sqlStr(['Du-Pa-Ju 09:00', 'Se-Ch-Sh 11:00', 'Du-Se-Pa 14:00'][i % 3])}, ${sqlStr('2025-09-01')});`);
  }
});
log(``);

// 4. Subjects
log(`-- ─── SUBJECTS ────────────────────────────────`);
let subjectId = SUBJECT_ID_BASE;
const subjects = [];
SUBJECTS_DEF.forEach((s, idx) => {
  const id = subjectId++;
  subjects.push({ id, ...s, originalIdx: idx });
  log(`INSERT INTO subjects (id, institution_id, type, name, short_name, credit_hours, applicable_grades, meta) VALUES (${id}, ${INSTITUTION_ID}, 'university', ${sqlStr(s.name)}, ${sqlStr(s.short)}, ${s.credits}, '[]', '{}');`);
});
log(``);

// 5. Teachers
log(`-- ─── TEACHERS ────────────────────────────────`);
const teachers = [];
TEACHERS.forEach((t, idx) => {
  const id = TEACHER_ID_BASE + idx;
  teachers.push({ id, ...t });
  log(`INSERT INTO users (id, email, password_hash, name, role, type, avatar, groups, course_type, institution_id) VALUES (${id}, ${sqlStr(t.email)}, ${sqlStr(PASSWORD_HASH)}, ${sqlStr(t.name)}, 'teacher', 'university', ${sqlStr(t.avatar)}, '[]', ${sqlStr(t.subject)}, ${INSTITUTION_ID});`);
});
log(``);

// 6. Students — distribute across groups
log(`-- ─── STUDENTS ────────────────────────────────`);
const students = [];
STUDENT_NAMES.forEach((name, idx) => {
  const id = STUDENT_ID_BASE + idx;
  // Username from "Surname F" -> surname only, lowercased, transliterated lightly
  const surname = name.split(" ")[0]
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[ʻʼ`]/g, "")
    .replace(/o'/g, "o")
    .replace(/g'/g, "g");
  const email = `${surname}${idx + 1}@eyeziyo.uz`;
  const avatar = name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  students.push({ id, name, email, avatar });
  log(`INSERT INTO users (id, email, password_hash, name, role, type, avatar, groups, course_type, institution_id) VALUES (${id}, ${sqlStr(email)}, ${sqlStr(PASSWORD_HASH)}, ${sqlStr(name)}, 'student', 'university', ${sqlStr(avatar)}, '[]', '', ${INSTITUTION_ID});`);
});
log(``);

// 7. Teacher → Subjects
log(`-- ─── TEACHER ↔ SUBJECTS ──────────────────────`);
Object.entries(SUBJECT_TEACHER).forEach(([sIdx, tIdxs]) => {
  const subj = subjects[Number(sIdx)];
  tIdxs.forEach((tIdx) => {
    log(`INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (${teachers[tIdx].id}, ${subj.id});`);
  });
});
log(``);

// 8. Teacher → Groups
//    First pass: guarantee every group is covered by at least 2 teachers
//    (so the group page never looks empty). Second pass: each teacher fills
//    out 1-2 extra random groups for variety.
log(`-- ─── TEACHER ↔ GROUPS ────────────────────────`);
const teacherGroups = []; // [{teacher, group, subject}]
const teacherSubjectMap = {};
TEACHERS.forEach((_, tIdx) => {
  teacherSubjectMap[tIdx] = Object.entries(SUBJECT_TEACHER)
    .filter(([_, tList]) => tList.includes(tIdx))
    .map(([sIdx]) => Number(sIdx));
});

// Guarantee coverage: each group gets 2 distinct teachers
groups.forEach((g) => {
  const eligibleTeachers = teachers.filter((_, idx) => teacherSubjectMap[idx].length > 0);
  const picked = pickN(eligibleTeachers, 2);
  picked.forEach((t) => {
    const tIdx = teachers.indexOf(t);
    const sIdx = pickRand(teacherSubjectMap[tIdx]);
    const subj = subjects[sIdx];
    teacherGroups.push({ teacher: t, group: g, subject: subj });
    log(`INSERT OR IGNORE INTO teacher_groups (teacher_id, group_id, subject_id) VALUES (${t.id}, ${g.id}, ${subj.id});`);
  });
});

// Each teacher gets a few extra random groups for spread
teachers.forEach((t, tIdx) => {
  if (teacherSubjectMap[tIdx].length === 0) return;
  const extraGroups = pickN(groups, rand(1, 2));
  extraGroups.forEach((g) => {
    const sIdx = pickRand(teacherSubjectMap[tIdx]);
    const subj = subjects[sIdx];
    teacherGroups.push({ teacher: t, group: g, subject: subj });
    log(`INSERT OR IGNORE INTO teacher_groups (teacher_id, group_id, subject_id) VALUES (${t.id}, ${g.id}, ${subj.id});`);
  });
});
log(``);

// 9. Student → Groups — round-robin so every group has ~equal students,
//    plus a few students get a second group for diversity.
log(`-- ─── STUDENT ↔ GROUPS ────────────────────────`);
const groupForStudent = {}; // student.id -> primary group
students.forEach((s, idx) => {
  const g = groups[idx % groups.length];
  groupForStudent[s.id] = g;
  log(`INSERT INTO student_groups (student_id, group_id) VALUES (${s.id}, ${g.id});`);
});
// 15% of students join a second group
students.forEach((s) => {
  if (Math.random() > 0.15) return;
  const primary = groupForStudent[s.id];
  const others = groups.filter((g) => g.id !== primary.id);
  const second = pickRand(others);
  log(`INSERT OR IGNORE INTO student_groups (student_id, group_id) VALUES (${s.id}, ${second.id});`);
});
log(``);

// 10. Lessons + Evaluations + Tests + Attempts + Chats
log(`-- ─── LESSONS + EVALUATIONS ───────────────────`);
let lessonId = LESSON_ID_BASE;
const lessons = []; // [{ id, teacher, group, subject, daysAgo }]

teacherGroups.forEach((tg) => {
  // Each teacher-group pairing has 4-7 lessons over the past 60 days
  const lessonCount = rand(4, 7);
  for (let i = 0; i < lessonCount; i++) {
    const id = lessonId++;
    const daysAgo = rand(1, 60);
    const hour = rand(8, 17);
    const created = isoDateOffset(daysAgo, hour);
    const transcripts = TRANSCRIPTS[tg.subject.name] || TRANSCRIPTS["Dasturlash asoslari"];
    const transcript = pickRand(transcripts);
    const duration = rand(900, 4500); // 15-75 min in seconds
    const topic = `${tg.subject.short} — ${pickRand([
      "Asosiy tushunchalar",
      "Amaliy mashq",
      "Misollar va tahlil",
      "Yangi mavzu kirishi",
      "Takrorlash va xulosa",
      "Yechimlar muhokamasi",
      "Test va o'zlashtirish",
      "Loyiha taqdimoti",
    ])}`;

    lessons.push({ id, teacher: tg.teacher, group: tg.group, subject: tg.subject, daysAgo, created });
    log(`INSERT INTO lessons (id, user_id, group_name, topic, course_type, duration_seconds, transcript, created_at) VALUES (${id}, ${tg.teacher.id}, ${sqlStr(tg.group.name)}, ${sqlStr(topic)}, ${sqlStr(tg.subject.name)}, ${duration}, ${sqlStr(transcript)}, ${sqlStr(created)});`);

    // Evaluation — 5 pedagogik mezon, har biri 0-20; overall = yig'indi (0-100).
    // Baza darajani tanlaymiz va har bir mezonni shu atrofida biroz tebratamiz,
    // shunda ballar taqsimoti 12-18 (60-90) oralig'iga moyil bo'ladi.
    const clampCrit = (v) => Math.min(20, Math.max(4, v));
    const base = Math.round(15 + (Math.random() - 0.5) * 7); // ~11..18
    const topicScore = clampCrit(base + rand(-3, 2));        // Mavzu mosligi va ilmiy terminologiya
    const speechScore = clampCrit(base + rand(-3, 2));       // Nutq maqsadliligi va akademik tozalik
    const methodScore = clampCrit(base + rand(-3, 3));       // Metodik mahorat va tushuntirish uslubi
    const interactionScore = clampCrit(base + rand(-4, 2));  // Interaktivlik va talabalar qamrovi
    const feedbackScore = clampCrit(base + rand(-4, 2));     // Baholash va teskari aloqa
    const overall = topicScore + speechScore + methodScore + interactionScore + feedbackScore;
    const tier = overall >= 80 ? "high" : overall >= 60 ? "mid" : "low";
    const summary = pickRand(SUMMARIES[tier]);
    const strengths = pickN(STRENGTHS, rand(2, 3));
    const improvements = pickN(IMPROVEMENTS, rand(2, 3));
    const advice = pickN(ADVICE, rand(2, 3));

    log(`INSERT INTO evaluations (lesson_id, overall_score, topic_score, speech_score, method_score, interaction_score, feedback_score, summary, strengths, improvements, advice, created_at) VALUES (${id}, ${overall}, ${topicScore}, ${speechScore}, ${methodScore}, ${interactionScore}, ${feedbackScore}, ${sqlStr(summary)}, ${jsonStr(strengths)}, ${jsonStr(improvements)}, ${jsonStr(advice)}, ${sqlStr(created)});`);
  }
});
log(``);

// 11. Lesson tests for ~60% of lessons
log(`-- ─── LESSON TESTS ────────────────────────────`);
const lessonsWithTests = [];
lessons.forEach((l) => {
  if (Math.random() > 0.6) return; // skip 40%
  const bank = QUIZ_BANK[l.subject.name];
  if (!bank) return;
  // Strip the correct field from questions stored on lesson_tests — backend
  // computes score from a separate path (see mentor.ts), and we mirror the
  // Question shape it expects: { q, choices, correct_choice }.
  const questions = bank.questions.map((q) => ({
    q: q.q,
    choices: q.choices,
    correct_choice: q.correct,
  }));
  log(`INSERT INTO lesson_tests (lesson_id, questions, key_terms, created_at) VALUES (${l.id}, ${jsonStr(questions)}, ${jsonStr(bank.terms)}, ${sqlStr(l.created)});`);
  lessonsWithTests.push(l);
});
log(``);

// 12. Test attempts — students in matching group take the test
log(`-- ─── TEST ATTEMPTS ───────────────────────────`);
// Build the same group→students map that step 9 used (round-robin)
const studentsByGroup = {};
groups.forEach((g) => { studentsByGroup[g.id] = []; });
students.forEach((s, idx) => {
  const g = groups[idx % groups.length];
  studentsByGroup[g.id].push(s);
});

let attemptCount = 0;
lessonsWithTests.forEach((l) => {
  const bank = QUIZ_BANK[l.subject.name];
  if (!bank) return;
  const correctAnswers = bank.questions.map((q) => q.correct);
  const groupStudents = studentsByGroup[l.group.id] || [];
  // ~60% of group students take each test
  const takers = groupStudents.filter(() => Math.random() < 0.6);
  takers.forEach((stu) => {
    // Generate answers — biased toward correct
    const answers = correctAnswers.map((c, qIdx) =>
      Math.random() < 0.7 ? c : (c + rand(1, 3)) % 4
    );
    const correct = answers.filter((a, i) => a === correctAnswers[i]).length;
    const score = Math.round((correct / answers.length) * 100);
    const attemptDate = isoDateOffset(Math.max(0, l.daysAgo - rand(0, 5)), rand(10, 22));
    log(`INSERT OR IGNORE INTO test_attempts (lesson_id, student_id, answers, score, completed_at) VALUES (${l.id}, ${stu.id}, ${jsonStr(answers)}, ${score}, ${sqlStr(attemptDate)});`);
    attemptCount++;
  });
});
log(``);

// 13. Mentor chats — ~30% of test takers also chat
log(`-- ─── MENTOR CHATS ────────────────────────────`);
let chatCount = 0;
lessonsWithTests.forEach((l) => {
  const samples = CHAT_SAMPLES[l.subject.name];
  if (!samples) return;
  const groupStudents = studentsByGroup[l.group.id] || [];
  const chatters = groupStudents.filter(() => Math.random() < 0.3);
  chatters.forEach((stu) => {
    const sample = pickRand(samples);
    const chatTime = isoDateOffset(Math.max(0, l.daysAgo - rand(0, 4)), rand(14, 22));
    log(`INSERT INTO mentor_chats (lesson_id, student_id, role, content, created_at) VALUES (${l.id}, ${stu.id}, 'user', ${sqlStr(sample.q)}, ${sqlStr(chatTime)});`);
    log(`INSERT INTO mentor_chats (lesson_id, student_id, role, content, created_at) VALUES (${l.id}, ${stu.id}, 'assistant', ${sqlStr(sample.a)}, ${sqlStr(chatTime)});`);
    chatCount++;
  });
});
log(``);

// 14. Final report
log(`-- ─── DONE ────────────────────────────────────`);
log(`-- Generated:`);
log(`--   ${facultyIds.length} faculties, ${directionIds.length} directions, ${courseNodes.length} courses`);
log(`--   ${groups.length} groups, ${subjects.length} subjects`);
log(`--   ${teachers.length} teachers, ${students.length} students`);
log(`--   ${lessons.length} lessons (each with evaluation)`);
log(`--   ${lessonsWithTests.length} lesson tests, ${attemptCount} attempts, ${chatCount} chat sessions`);

process.stdout.write(lines.join("\n") + "\n");

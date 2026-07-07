export type Article = {
  id: string;
  from: string;
  to: string;
  emoji: string;
  readMins: number;
  en: { tag: string; title: string; excerpt: string; body: string[] };
  ar: { tag: string; title: string; excerpt: string; body: string[] };
};

export const ARTICLES: Article[] = [
  {
    id: "coronavirus-myths", from: "#e8d5f0", to: "#d5e8f5", emoji: "🦠", readMins: 6,
    en: {
      tag: "Coronavirus",
      title: "12 Coronavirus Myths and Facts You Should Know",
      excerpt: "Separating fact from fiction on transmission, immunity, and prevention.",
      body: [
        "Misinformation spreads almost as fast as the virus itself, and it can lead people to make decisions that put their health at risk. Here are some of the most common myths, and what the evidence actually says.",
        "Myth: Only older adults need to worry. Fact: while age and existing conditions raise risk, people of every age can get seriously ill, and everyone can pass the virus on to someone vulnerable.",
        "Myth: Once you've recovered, you're immune forever. Fact: immunity can fade over time and varies between individuals, which is why booster doses and continued precautions matter for high-risk groups.",
        "Myth: Antibiotics can treat it. Fact: antibiotics only work on bacterial infections. Taking them unnecessarily does nothing for a viral illness and contributes to antibiotic resistance.",
        "The most reliable prevention still comes down to the basics: good ventilation, hand hygiene, staying home when unwell, and speaking with a doctor early if symptoms are severe or you're in a high-risk group.",
      ],
    },
    ar: {
      tag: "كورونا",
      title: "١٢ خرافة وحقيقة عن كورونا يجب أن تعرفها",
      excerpt: "الفصل بين الحقيقة والخرافة حول انتقال العدوى والمناعة والوقاية.",
      body: [
        "تنتشر المعلومات المضللة بسرعة تضاهي انتشار الفيروس نفسه، وقد تدفع الناس لاتخاذ قرارات تعرض صحتهم للخطر. فيما يلي بعض أكثر الخرافات شيوعاً، وما تقوله الأدلة العلمية فعلياً.",
        "خرافة: كبار السن فقط من يجب أن يقلقوا. حقيقة: رغم أن العمر والأمراض المزمنة ترفع الخطورة، يمكن لأي شخص من أي عمر أن يصاب بمرض شديد وأن ينقل العدوى لشخص أكثر عرضة للخطر.",
        "خرافة: بعد الشفاء تصبح محصناً للأبد. حقيقة: المناعة قد تضعف مع الوقت وتختلف من شخص لآخر، لذلك تبقى الجرعات المعززة والاحتياطات مهمة للفئات الأكثر عرضة للخطر.",
        "خرافة: المضادات الحيوية تعالج المرض. حقيقة: المضادات الحيوية تعمل فقط ضد البكتيريا. تناولها دون داعٍ لا يفيد في مرض فيروسي ويساهم في مقاومة المضادات الحيوية.",
        "تبقى أفضل وسائل الوقاية هي الأساسيات: التهوية الجيدة، غسل اليدين، البقاء في المنزل عند المرض، واستشارة طبيب مبكراً إذا كانت الأعراض شديدة أو كنت من الفئات الأكثر عرضة.",
      ],
    },
  },
  {
    id: "immunity-nutrition", from: "#d5e8f5", to: "#ede0f8", emoji: "🥗", readMins: 5,
    en: {
      tag: "Vitamins & Supplements",
      title: "Eating Right to Build Immunity Against Viral Infections",
      excerpt: "The nutrients that actually support your immune system, and how much you need.",
      body: [
        "No single food or supplement can prevent infection, but a consistently balanced diet gives your immune system the raw materials it needs to function well.",
        "Vitamin C, found in citrus fruits, peppers, and leafy greens, supports the production of white blood cells. Vitamin D, mostly made through sunlight exposure, plays a key role in immune regulation — deficiency is common and worth checking with your doctor.",
        "Zinc, present in nuts, seeds, and legumes, helps immune cells communicate. Protein is equally important, since antibodies themselves are built from amino acids.",
        "Supplements can help fill gaps, but they aren't a substitute for real food, sleep, and stress management, all of which affect immune function more than any single pill.",
        "If you're considering high-dose supplements, especially for children or during pregnancy, check with a doctor first — more isn't always better.",
      ],
    },
    ar: {
      tag: "فيتامينات ومكملات",
      title: "تناول الغذاء الصحيح لبناء المناعة ضد الفيروسات",
      excerpt: "العناصر الغذائية التي تدعم مناعتك فعلياً، وما هي الكمية التي تحتاجها.",
      body: [
        "لا يوجد طعام أو مكمل واحد يمنع العدوى، لكن النظام الغذائي المتوازن باستمرار يمنح جهازك المناعي المواد التي يحتاجها ليعمل بكفاءة.",
        "فيتامين C الموجود في الحمضيات والفلفل والخضروات الورقية يدعم إنتاج خلايا الدم البيضاء. فيتامين D الذي يُصنع غالباً عبر التعرض للشمس يلعب دوراً أساسياً في تنظيم المناعة — نقصه شائع ويستحق الفحص مع طبيبك.",
        "الزنك الموجود في المكسرات والبذور والبقوليات يساعد خلايا المناعة على التواصل. البروتين مهم بنفس القدر لأن الأجسام المضادة نفسها تُبنى من الأحماض الأمينية.",
        "المكملات قد تساعد في سد الفجوات، لكنها ليست بديلاً عن الطعام الحقيقي والنوم وإدارة التوتر، وكلها تؤثر في المناعة أكثر من أي حبة واحدة.",
        "إذا كنت تفكر في مكملات بجرعات عالية، خاصة للأطفال أو أثناء الحمل، استشر طبيباً أولاً — فالمزيد ليس دائماً أفضل.",
      ],
    },
  },
  {
    id: "mental-health-checkin", from: "#ede0f8", to: "#e8d5f0", emoji: "🧠", readMins: 7,
    en: {
      tag: "Mental Health",
      title: "Why a Weekly Mental Health Check-In Matters",
      excerpt: "Simple habits to notice stress and anxiety before they build up.",
      body: [
        "Most people track their physical symptoms closely but rarely pause to ask how they're doing mentally — until stress has already built up into something harder to manage.",
        "A weekly check-in doesn't need to be formal. Ask yourself: how has my sleep been, have I felt irritable or withdrawn, am I still enjoying things I usually enjoy? Patterns matter more than any single bad day.",
        "Journaling for five minutes, talking to a friend, or simply naming what you're feeling out loud can interrupt the spiral of unexamined stress before it affects sleep, appetite, or relationships.",
        "If low mood, anxiety, or lack of interest last more than two weeks and start affecting daily life, that's a sign to talk to a professional rather than wait it out.",
        "Seeking support early isn't a sign of weakness — it's the same logic as treating a physical symptom before it worsens.",
      ],
    },
    ar: {
      tag: "الصحة النفسية",
      title: "لماذا تهم المراجعة الأسبوعية لصحتك النفسية",
      excerpt: "عادات بسيطة لملاحظة التوتر والقلق قبل أن يتراكما.",
      body: [
        "يتابع معظم الناس أعراضهم الجسدية عن كثب لكنهم نادراً ما يتوقفون ليسألوا أنفسهم كيف حالهم النفسي — إلى أن يتراكم التوتر ليصبح أصعب في التعامل معه.",
        "لا تحتاج المراجعة الأسبوعية أن تكون رسمية. اسأل نفسك: كيف كان نومي، هل شعرت بالانفعال أو الانطواء، هل ما زلت أستمتع بالأشياء التي أحبها عادة؟ الأنماط أهم من أي يوم سيء واحد.",
        "كتابة اليوميات لخمس دقائق، أو التحدث مع صديق، أو مجرد تسمية ما تشعر به بصوت عالٍ يمكن أن يوقف دوامة التوتر غير المُتفحَّص قبل أن تؤثر على النوم أو الشهية أو العلاقات.",
        "إذا استمر المزاج المنخفض أو القلق أو فقدان الاهتمام لأكثر من أسبوعين وبدأ يؤثر على الحياة اليومية، فهذه إشارة للتحدث مع مختص بدلاً من الانتظار.",
        "طلب الدعم مبكراً ليس علامة ضعف — بل نفس منطق علاج العرض الجسدي قبل أن يتفاقم.",
      ],
    },
  },
  {
    id: "womens-health-screening", from: "#fde68a", to: "#e8d5f0", emoji: "🌺", readMins: 8,
    en: {
      tag: "Women's Health",
      title: "Screenings Every Woman Should Schedule by Age",
      excerpt: "A simple, age-by-age guide to the checkups that matter most.",
      body: [
        "Preventive screenings catch problems early, when they're most treatable. Here's a general guide — your doctor may adjust timing based on your personal and family history.",
        "In your 20s: annual physicals, cervical cancer screening starting at 21, and a baseline conversation about reproductive health and contraception if relevant.",
        "In your 30s and 40s: continued cervical screening, blood pressure and cholesterol checks, and a discussion with your doctor about when to start breast cancer screening based on your risk factors.",
        "From 40 onward: regular mammograms as recommended by your doctor, bone density awareness approaching menopause, and continued cardiovascular risk monitoring.",
        "Beyond the calendar, don't wait for a scheduled visit if something feels wrong — unusual bleeding, persistent pain, or a new lump are always worth an earlier appointment.",
      ],
    },
    ar: {
      tag: "صحة المرأة",
      title: "الفحوصات التي يجب أن تحجزها كل امرأة حسب العمر",
      excerpt: "دليل بسيط للفحوصات الأهم في كل مرحلة عمرية.",
      body: [
        "الفحوصات الوقائية تكتشف المشاكل مبكراً، حين تكون أكثر قابلية للعلاج. إليك دليل عام — قد يعدّل طبيبك التوقيت بناءً على تاريخك الشخصي والعائلي.",
        "في العشرينات: فحوصات سنوية شاملة، فحص عنق الرحم بدءاً من سن ٢١، ونقاش أساسي حول الصحة الإنجابية ووسائل منع الحمل إن لزم.",
        "في الثلاثينات والأربعينات: الاستمرار في فحص عنق الرحم، فحص ضغط الدم والكوليسترول، ونقاش مع طبيبك حول موعد بدء فحص سرطان الثدي بناءً على عوامل الخطورة لديك.",
        "من سن الأربعين فصاعداً: تصوير الثدي الشعاعي بانتظام حسب توصية طبيبك، والانتباه لكثافة العظام قرب سن اليأس، ومتابعة مستمرة لمخاطر القلب والأوعية الدموية.",
        "بعيداً عن الجدول الزمني، لا تنتظري الموعد المحدد إذا شعرتِ أن هناك خطباً — نزيف غير معتاد أو ألم مستمر أو كتلة جديدة تستحق دائماً موعداً أقرب.",
      ],
    },
  },
  {
    id: "child-fever-guide", from: "#d1fae5", to: "#d5e8f5", emoji: "👶", readMins: 5,
    en: {
      tag: "Pediatrics",
      title: "Fever in Children: When to Worry, When to Wait",
      excerpt: "A calm guide for parents on temperatures, symptoms, and red flags.",
      body: [
        "A fever is a sign the body is fighting an infection — it's rarely dangerous on its own, and the number on the thermometer matters less than how your child is behaving.",
        "For most children, mild-to-moderate fever with normal drinking, playing, and alertness can be managed at home with fluids, rest, and age-appropriate fever medication if they're uncomfortable.",
        "Contact a doctor promptly if your child is under 3 months old with any fever, if fever lasts more than 3 days, if they're unusually drowsy or hard to wake, or if they show a rash, stiff neck, or difficulty breathing.",
        "Avoid over-bundling a feverish child — light clothing and a comfortably cool room help the body regulate temperature naturally.",
        "Trust your instincts as a parent: if something feels wrong even without a specific red flag, it's always reasonable to get your child checked.",
      ],
    },
    ar: {
      tag: "طب الأطفال",
      title: "حمى الأطفال: متى تقلق ومتى تنتظر",
      excerpt: "دليل هادئ للآباء حول درجات الحرارة والأعراض وعلامات الخطر.",
      body: [
        "الحمى علامة على أن الجسم يحارب عدوى ما — ونادراً ما تكون خطيرة بحد ذاتها، والرقم على الترمومتر أقل أهمية من سلوك طفلك.",
        "بالنسبة لمعظم الأطفال، يمكن التعامل مع الحمى الخفيفة إلى المتوسطة مع شرب طبيعي ولعب ويقظة في المنزل عبر السوائل والراحة وخافض حرارة مناسب للعمر إذا شعر الطفل بعدم الارتياح.",
        "اتصلي بطبيب فوراً إذا كان طفلك أقل من ٣ أشهر ولديه أي حمى، أو استمرت الحمى أكثر من ٣ أيام، أو كان نعساً بشكل غير معتاد أو يصعب إيقاظه، أو ظهر لديه طفح جلدي أو تيبس في الرقبة أو صعوبة في التنفس.",
        "تجنبي تدفئة الطفل المصاب بالحمى بشكل مفرط — الملابس الخفيفة والغرفة الباردة بشكل مريح تساعدان الجسم على تنظيم حرارته طبيعياً.",
        "ثقي بحدسك كأم أو أب: إذا شعرتِ أن هناك خطباً حتى دون علامة خطر محددة، من المعقول دائماً فحص طفلك.",
      ],
    },
  },
  {
    id: "desk-posture", from: "#c8dff0", to: "#d1fae5", emoji: "🧘", readMins: 4,
    en: {
      tag: "Fitness",
      title: "5-Minute Stretches for a Desk-Bound Back",
      excerpt: "Quick moves to undo hours of sitting, no equipment needed.",
      body: [
        "Sitting for long stretches shortens your hip flexors, rounds your shoulders, and puts steady pressure on your lower spine. A few minutes of movement every hour can undo most of the damage.",
        "Start with a seated spinal twist: sit tall, place one hand on the opposite knee, and gently rotate your torso, holding 15–20 seconds each side.",
        "Follow with a doorway chest stretch to counter rounded shoulders, and a standing hip flexor stretch by stepping one foot back into a gentle lunge.",
        "Finish with a neck release — slowly tilt your ear toward your shoulder and hold, then repeat on the other side.",
        "Set a reminder to stand and move every 45–60 minutes; consistency matters more than intensity for undoing the effects of prolonged sitting.",
      ],
    },
    ar: {
      tag: "لياقة",
      title: "تمارين إطالة لمدة ٥ دقائق لظهر يجلس طويلاً",
      excerpt: "حركات سريعة لتعويض ساعات الجلوس، بدون أي معدات.",
      body: [
        "الجلوس لفترات طويلة يقصّر عضلات مثنية الورك، ويقوّس الكتفين، ويضع ضغطاً مستمراً على أسفل العمود الفقري. بضع دقائق من الحركة كل ساعة يمكن أن تعوّض معظم هذا الضرر.",
        "ابدأ بلفة للعمود الفقري وأنت جالس: اجلس منتصباً، ضع يدك على الركبة المقابلة، ولفّ جذعك بلطف مع الثبات ١٥-٢٠ ثانية لكل جانب.",
        "تابع بإطالة للصدر عند باب لمقاومة تقوس الكتفين، وإطالة لمثنية الورك بالوقوف مع خطوة خلفية بشكل اندفاعة خفيفة.",
        "أنهِ بتحرير للرقبة — أمِل أذنك ببطء نحو كتفك واثبت، ثم كرر على الجانب الآخر.",
        "اضبط تذكيراً للوقوف والحركة كل ٤٥-٦٠ دقيقة؛ الانتظام أهم من الشدة لتعويض آثار الجلوس الطويل."],
    },
  },
  {
    id: "managing-diabetes", from: "#e8d5f0", to: "#c8dff0", emoji: "💉", readMins: 9,
    en: {
      tag: "Chronic Care",
      title: "Living Well with Type 2 Diabetes",
      excerpt: "Daily habits that keep blood sugar steady without feeling restrictive.",
      body: [
        "A type 2 diabetes diagnosis can feel overwhelming, but stable blood sugar is very achievable through a handful of consistent daily habits rather than strict, hard-to-sustain rules.",
        "Spacing carbohydrates evenly across meals, rather than eliminating them, helps prevent the sharp spikes and crashes that leave you feeling unwell.",
        "A 20–30 minute walk after meals is one of the most effective, low-effort ways to lower post-meal blood sugar — even light activity makes a measurable difference.",
        "Consistent sleep and stress management matter more than most people realize; poor sleep and high stress both raise blood sugar independently of diet.",
        "Regular check-ins with your doctor to review medication, HbA1c levels, and any early signs of complications keep small issues from becoming bigger ones.",
      ],
    },
    ar: {
      tag: "أمراض مزمنة",
      title: "العيش الصحي مع السكري من النوع الثاني",
      excerpt: "عادات يومية تحافظ على استقرار السكر دون الشعور بالحرمان.",
      body: [
        "قد يبدو تشخيص السكري من النوع الثاني مرهقاً، لكن استقرار سكر الدم قابل للتحقيق فعلاً من خلال عدد قليل من العادات اليومية الثابتة بدلاً من قواعد صارمة يصعب الاستمرار عليها.",
        "توزيع الكربوهيدرات بالتساوي على الوجبات، بدلاً من إلغائها تماماً، يساعد في منع الارتفاعات والانخفاضات الحادة التي تجعلك تشعر بتوعك.",
        "المشي لمدة ٢٠-٣٠ دقيقة بعد الوجبات من أكثر الطرق فعالية وسهولة لخفض سكر الدم بعد الأكل — حتى النشاط الخفيف يُحدث فرقاً ملموساً.",
        "النوم المنتظم وإدارة التوتر أهم مما يدركه معظم الناس؛ فقلة النوم والتوتر العالي يرفعان سكر الدم بشكل مستقل عن الغذاء.",
        "المراجعات المنتظمة مع طبيبك لمتابعة الأدوية ومستوى السكر التراكمي وأي علامات مبكرة للمضاعفات تمنع المشاكل الصغيرة من التفاقم.",
      ],
    },
  },
  {
    id: "skin-sun-care", from: "#fde68a", to: "#d5e8f5", emoji: "🧴", readMins: 5,
    en: {
      tag: "Skin Care",
      title: "Sun Protection Habits That Actually Work in Oman's Climate",
      excerpt: "SPF, timing, and clothing choices suited to high UV index days.",
      body: [
        "With UV index frequently reaching extreme levels for much of the year, sun protection here needs to go beyond an occasional sunscreen application.",
        "Apply a broad-spectrum SPF 30+ every morning as part of your routine, not just on beach days, and reapply every two hours if you're outdoors for extended periods.",
        "Between 11am and 3pm, UV exposure is at its most intense — scheduling outdoor errands or exercise outside this window meaningfully reduces cumulative sun damage.",
        "Lightweight, tightly woven long sleeves and a wide-brimmed hat often protect better than sunscreen alone, especially for children.",
        "Watch for new or changing moles, and get any skin change that grows, bleeds, or looks unusual checked by a doctor — early detection makes skin cancer highly treatable.",
      ],
    },
    ar: {
      tag: "العناية بالبشرة",
      title: "عادات الحماية من الشمس الفعالة في مناخ عمان",
      excerpt: "واقي الشمس والتوقيت واختيار الملابس المناسبة لأيام الأشعة الفوق بنفسجية العالية.",
      body: [
        "مع وصول مؤشر الأشعة فوق البنفسجية إلى مستويات شديدة معظم أيام السنة، تحتاج الحماية من الشمس هنا إلى أكثر من وضع واقي الشمس بين الحين والآخر.",
        "ضعي واقي شمس واسع الطيف بعامل حماية ٣٠ أو أكثر كل صباح كجزء من روتينك، وليس فقط في أيام الشاطئ، وأعيدي وضعه كل ساعتين إذا كنتِ في الخارج لفترات طويلة.",
        "بين الساعة ١١ صباحاً و٣ عصراً، تكون الأشعة فوق البنفسجية في أشد قوتها — جدولة المهام أو الرياضة خارج هذا الوقت يقلل بشكل ملموس من الضرر التراكمي.",
        "الأكمام الطويلة الخفيفة محكمة النسج والقبعة واسعة الحواف غالباً ما تحمي أفضل من واقي الشمس وحده، خاصة للأطفال.",
        "راقبي أي شامة جديدة أو متغيرة، واطلبي فحص أي تغيّر في الجلد ينمو أو ينزف أو يبدو غير معتاد من طبيب — الكشف المبكر يجعل سرطان الجلد قابلاً للعلاج بدرجة عالية.",
      ],
    },
  },
];

export function getArticle(id: string): Article | undefined {
  return ARTICLES.find(a => a.id === id);
}

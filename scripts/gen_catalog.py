"""Generate the SYNTHETIC gift catalog (600 products). Deterministic: seed 7.

Every product, price, rating and review here is invented. Nothing is scraped
or copied from a retailer or publication. Run: python3 scripts/gen_catalog.py
"""
import json, math, random

rng = random.Random(7)

# category: (interests, nouns, adjectives, price_lo, price_hi, age_min, age_max,
#            battery_prob, recipients, occasions, extra_tags, review_aspects)
C = {
 "coffee": (["coffee","espresso","cafe"], ["pour-over set","French press","burr grinder","milk frother","coffee sampler","insulated travel mug","cold brew pitcher"], ["Ceramic","Stainless","Matte","Compact","Classic"], 18, 140, 16, 99, .15, ["dad","mom","friend","coworker","grandparent"], ["birthday","housewarming","thank you","christmas"], ["kitchen","caffeine"], ["brews a smooth cup","easy to clean","keeps drinks hot"]),
 "tea": (["tea","herbal tea"], ["loose-leaf tea sampler","cast-iron teapot","tea infuser set","matcha whisk kit","herbal tea box"], ["Floral","Smoky","Calming","Ceramic","Bamboo"], 12, 70, 12, 99, 0, ["mom","grandparent","friend","teacher","coworker"], ["birthday","thank you","christmas","get well"], ["kitchen","relaxing"], ["smells wonderful","relaxing evening ritual","beautiful packaging"]),
 "baking": (["baking","cooking","desserts"], ["cookie cutter set","silicone baking mat","stand mixer attachment","sourdough starter kit","cake decorating kit","rolling pin set"], ["Professional","Starter","Nonstick","Deluxe"], 10, 120, 8, 99, .05, ["mom","friend","kid","grandparent","teacher"], ["birthday","christmas","housewarming"], ["kitchen"], ["bakes evenly","great for beginners","sturdy"]),
 "cooking": (["cooking","kitchen","food"], ["chef knife","cast-iron skillet","spice rack","herb garden planter","olive oil tasting set","meal prep containers","digital kitchen scale"], ["Forged","Pro","Compact","Premium"], 15, 180, 14, 99, .1, ["dad","mom","friend","coworker","grandparent"], ["housewarming","wedding","birthday","christmas"], ["kitchen"], ["feels solid in the hand","makes weeknight dinners easier","holds up to daily use"]),
 "gardening": (["gardening","plants","garden"], ["pruning shears","seed starter kit","indoor herb garden","kneeling pad","watering can","terrarium kit","bonsai starter kit"], ["Heirloom","Ergonomic","Copper","Mini"], 10, 90, 8, 99, .05, ["grandparent","mom","dad","friend","neighbor"], ["birthday","mother's day","housewarming","thank you"], ["outdoors","plants"], ["plants thrived","comfortable grip","a nice slow hobby"]),
 "hiking": (["hiking","outdoors","trail"], ["trekking poles","insulated water bottle","daypack","trail first-aid kit","merino hiking socks","headlamp","trail map case"], ["Ultralight","Rugged","Waterproof","Compact"], 15, 160, 12, 99, .2, ["dad","friend","teen","brother","partner"], ["birthday","christmas","graduation"], ["outdoors","adventure"], ["survived a wet weekend","light enough for long days","well made"]),
 "camping": (["camping","outdoors","adventure"], ["camp lantern","hammock","compact camp stove","sleeping pad","enamel camp mug set","fire starter kit"], ["Packable","Rugged","Weatherproof"], 14, 150, 10, 99, .3, ["dad","friend","kid","brother","partner"], ["birthday","christmas","father's day"], ["outdoors","adventure"], ["easy to set up","packs down small","great for family trips"]),
 "fitness": (["fitness","workout","gym"], ["resistance band set","foam roller","adjustable dumbbell","jump rope","gym bag","yoga mat","massage gun"], ["Pro","Travel","Heavy-duty","Slim"], 12, 170, 14, 99, .25, ["friend","partner","brother","sister","teen"], ["birthday","new year","christmas"], ["health","active"], ["noticeable difference in recovery","sturdy and grippy","fits in a small apartment"]),
 "running": (["running","jogging","marathon"], ["reflective running vest","running belt","sports watch","compression socks","hydration pack","trail running cap"], ["Breathable","Reflective","Lightweight"], 12, 200, 12, 99, .3, ["friend","dad","partner","sister"], ["birthday","christmas","graduation"], ["active","sports"], ["no bounce on long runs","great visibility at night","comfortable"]),
 "cycling": (["cycling","bike","bicycle"], ["bike lights set","bike lock","cycling gloves","handlebar bag","repair kit","kids bike helmet"], ["Compact","Rugged","Reflective"], 14, 120, 5, 99, .3, ["dad","kid","friend","teen","brother"], ["birthday","christmas"], ["outdoors","active"], ["very bright","feels secure","easy to install"]),
 "boardgames": (["board games","games","family game night","strategy"], ["strategy board game","cooperative card game","party game","chess set","trivia game","dice-building game"], ["Family","Classic","Deluxe","Travel"], 12, 70, 6, 99, 0, ["family","friend","kid","teen","coworker"], ["birthday","christmas","housewarming"], ["indoor","social"], ["gets played every weekend","easy to teach","great for groups"]),
 "puzzles": (["puzzles","jigsaw","brain teasers"], ["1000-piece jigsaw puzzle","wooden brain teaser set","3D puzzle","crossword book","mechanical puzzle box","kids 48-piece floor puzzle"], ["Scenic","Wooden","Large-piece","Challenging"], 8, 55, 3, 99, 0, ["grandparent","kid","mom","dad","friend"], ["birthday","get well","christmas"], ["indoor","calm"], ["relaxing","hours of fun","quality cut pieces"]),
 "building": (["building","construction","blocks","engineering"], ["brick building set","magnetic tile set","marble run","model kit","wooden construction set"], ["Creative","Mega","Starter","Classic"], 15, 160, 4, 99, .05, ["kid","teen","nephew","niece"], ["birthday","christmas"], ["creative","stem"], ["kept my kid busy for hours","pieces fit well","great imagination play"]),
 "art": (["art","drawing","painting","sketching"], ["watercolor set","sketchbook bundle","acrylic paint set","calligraphy pen kit","colored pencil tin","easel"], ["Artist","Student","Travel","Deluxe"], 9, 110, 5, 99, 0, ["kid","teen","friend","mom","niece"], ["birthday","christmas","graduation"], ["creative"], ["rich pigments","nice paper quality","inspired me to start again"]),
 "crafts": (["crafts","knitting","sewing","diy"], ["beginner knitting kit","embroidery kit","candle making kit","friendship bracelet kit","pottery clay set","macrame kit"], ["Beginner","Cozy","Complete"], 12, 70, 7, 99, 0, ["grandparent","mom","kid","friend","teen"], ["birthday","christmas","get well"], ["creative","calm"], ["clear instructions","everything included","calming hobby"]),
 "reading": (["reading","books","novels"], ["clip-on book light","leather bookmark set","book subscription voucher","cozy reading pillow","bookends","hardcover classic collection"], ["Vintage","Leather","Cozy"], 8, 90, 8, 99, .2, ["mom","friend","grandparent","teacher","coworker"], ["birthday","christmas","thank you"], ["quiet","indoor"], ["perfect for bedtime reading","well made","thoughtful"]),
 "stationery": (["journaling","stationery","planner","writing"], ["dotted notebook","fountain pen","weekly planner","gratitude journal","washi tape set","desk organizer"], ["Linen","Premium","Minimalist"], 7, 80, 8, 99, 0, ["teacher","coworker","friend","teen","mom"], ["thank you","graduation","new year","birthday"], ["office"], ["paper feels great","pen glides smoothly","keeps me organized"]),
 "music": (["music","instruments","guitar","piano"], ["ukulele","kalimba","harmonica","digital metronome","beginner drum pad","guitar tuner clip","keyboard stand"], ["Beginner","Travel","Acoustic"], 12, 190, 6, 99, .3, ["teen","kid","friend","partner","dad"], ["birthday","christmas","graduation"], ["creative","audio"], ["stays in tune","fun to learn","great sound for the price"]),
 "audio": (["headphones","audio","speaker","music"], ["wireless earbuds","over-ear headphones","portable bluetooth speaker","kids volume-limited headphones","turntable","sleep headphones"], ["Noise-cancelling","Compact","Studio"], 18, 220, 3, 99, 1, ["teen","friend","partner","brother","dad"], ["birthday","christmas","graduation"], ["tech","audio","needs batteries"], ["clear sound","battery lasts all week","comfortable fit"]),
 "gaming": (["gaming","video games","console"], ["controller","gaming headset","console stand","gaming mouse pad","retro handheld","gift card for games"], ["Pro","Retro","RGB"], 12, 190, 7, 99, .8, ["teen","brother","friend","nephew","partner"], ["birthday","christmas"], ["tech","screen"], ["responsive","comfortable for long sessions","great value"]),
 "tech": (["tech","gadgets","electronics"], ["wireless charger","smart plug set","portable power bank","tablet stand","e-ink reader","phone tripod","tracker tag"], ["Slim","Smart","Fast"], 10, 150, 12, 99, .9, ["dad","friend","coworker","teen","partner"], ["birthday","christmas","father's day"], ["tech","needs batteries"], ["works as described","setup took a minute","reliable"]),
 "photo": (["photography","camera","photos"], ["instant film pack","camera strap","mini tripod","photo album","lens cleaning kit","photo printer"], ["Vintage","Pro","Compact"], 10, 170, 8, 99, .4, ["friend","mom","teen","grandparent","partner"], ["birthday","christmas","wedding"], ["creative"], ["great memories","good build","easy to use"]),
 "travel": (["travel","trips","adventure"], ["packing cubes","passport wallet","neck pillow","universal adapter","luggage scale","scratch-off world map"], ["Compact","Leather","Organized"], 8, 90, 10, 99, .2, ["friend","partner","dad","coworker","graduate"], ["birthday","graduation","christmas","retirement"], ["travel"], ["made packing easy","fits everything","well stitched"]),
 "dog": (["dogs","pets","puppy"], ["chew toy set","dog treat jar","adjustable harness","slow-feeder bowl","dog bandana set","pet photo mug"], ["Durable","Squeaky","Cozy"], 6, 80, 0, 99, .1, ["friend","neighbor","family","coworker"], ["birthday","christmas","new pet"], ["pets"], ["my dog loves it","held up to chewing","good quality"]),
 "cat": (["cats","pets","kitten"], ["cat scratching post","feather wand set","catnip toy set","cat tunnel","window perch","cat treat sampler"], ["Plush","Sturdy","Cozy"], 6, 90, 0, 99, .1, ["friend","neighbor","family","coworker"], ["birthday","christmas","new pet"], ["pets"], ["my cat is obsessed","easy to assemble","good quality"]),
 "cozy": (["cozy","home","relaxing","decor"], ["chunky knit blanket","soy candle set","slippers","weighted blanket","ceramic mug set","aroma diffuser","fuzzy socks"], ["Plush","Cozy","Hand-poured","Soft"], 10, 110, 10, 99, .1, ["mom","grandparent","friend","sister","partner"], ["birthday","christmas","get well","housewarming"], ["relaxing","home"], ["so soft","made the room feel warm","lovely scent"]),
 "selfcare": (["skincare","self-care","spa","beauty"], ["bath bomb set","face mask set","body butter","hand cream trio","silk pillowcase","gua sha set","bath salts"], ["Fragrance-free","Lavender","Hydrating","Gentle"], 8, 85, 12, 99, 0, ["mom","sister","friend","teacher","partner"], ["birthday","mother's day","thank you","get well"], ["relaxing","health"], ["skin felt softer","calming","nice packaging"]),
 "jewelry": (["jewelry","accessories"], ["birthstone necklace","stud earring set","charm bracelet","jewelry box","personalized name ring","watch band"], ["Sterling","Dainty","Gold-tone","Hypoallergenic"], 14, 160, 10, 99, 0, ["partner","mom","sister","friend","niece"], ["birthday","anniversary","graduation","valentine's day"], ["fashion"], ["looks more expensive than it is","delicate","arrived beautifully boxed"]),
 "science": (["science","stem","experiments","chemistry"], ["crystal growing kit","microscope set","volcano experiment kit","snap circuits set","star projector","dinosaur excavation kit"], ["Junior","Young","Explorer"], 12, 90, 5, 14, .4, ["kid","nephew","niece","teen"], ["birthday","christmas"], ["stem","learning"], ["my kid asked to do it again","easy instructions","educational and fun"]),
 "toddler": (["toddler","baby","learning toys","preschool"], ["stacking cups","wooden shape sorter","soft board book set","push walker","finger paint set (washable)","musical rattle"], ["Soft","Chunky","Wooden"], 7, 60, 1, 4, .15, ["toddler","baby","niece","nephew"], ["birthday","baby shower","christmas"], ["early learning"], ["perfect size for small hands","survived the throwing phase","calming"]),
 "plush": (["plush","stuffed animals","soft toys"], ["giant teddy bear","dinosaur plush","weighted plush","bunny plush","unicorn plush"], ["Super-soft","Jumbo","Cuddly"], 8, 60, 0, 12, 0, ["kid","toddler","niece","baby","partner"], ["birthday","valentine's day","christmas","get well"], ["comfort"], ["so cuddly","washes well","favorite bedtime friend"]),
 "outdoorplay": (["outdoor play","sports","backyard"], ["kite","bubble machine","badminton set","water blaster","sidewalk chalk set","soccer ball","frisbee set"], ["Giant","Splash","Family"], 6, 70, 3, 14, .1, ["kid","nephew","niece","family"], ["birthday","summer"], ["outdoors","active"], ["hours of backyard fun","tough","easy to set up"]),
 "cocktails": (["cocktails","wine","bar"], ["cocktail shaker set","wine decanter","whiskey glasses","bitters sampler","bar tool set","wine chiller"], ["Crystal","Copper","Classic"], 15, 130, 21, 99, 0, ["dad","friend","coworker","brother","partner"], ["housewarming","wedding","christmas","birthday"], ["adult only","entertaining"], ["looks great on the bar cart","weighty and well made","good gift for hosts"]),
 "fishing": (["fishing","angling"], ["tackle box","fly-fishing starter kit","fishing hat","fish scale","kids fishing rod"], ["Compact","Pro","Starter"], 14, 120, 6, 99, .05, ["dad","grandparent","friend","kid"], ["father's day","birthday","retirement"], ["outdoors"], ["great starter set","well organized","caught fish first try"]),
 "tools": (["woodworking","tools","diy","home improvement"], ["precision screwdriver set","headlamp work light","multi-tool","tape measure set","beginner woodworking kit","cordless drill bit set"], ["Pro","Compact","Heavy-duty"], 12, 150, 14, 99, .3, ["dad","brother","friend","grandparent"], ["father's day","birthday","housewarming","christmas"], ["workshop"], ["very sturdy","all the right sizes","handy around the house"]),
 "teacher": (["teacher","classroom","appreciation"], ["thank-you card set","desk plant","personalized pencil set","insulated tumbler","gift card holder","hand lotion trio"], ["Thoughtful","Classic"], 6, 40, 3, 99, 0, ["teacher","coworker"], ["thank you","end of year"], ["office"], ["a lovely small gift","well received","nice presentation"]),
 "baby": (["baby","newborn","nursery"], ["muslin swaddle set","baby memory book","teething toy","nursery night light","soft crinkle book"], ["Organic","Soft","Gentle"], 8, 80, 0, 2, .2, ["baby","friend","sister"], ["baby shower","birthday","new parent"], ["baby"], ["gentle on skin","washes well","adorable"]),
 "snacks": (["snacks","chocolate","sweets","food"], ["artisan chocolate box","gourmet popcorn tin","hot sauce trio","nut brittle tin","granola gift basket","cookie assortment","honey sampler"], ["Gourmet","Small-batch","Classic"], 9, 70, 4, 99, 0, ["coworker","teacher","friend","neighbor","grandparent"], ["thank you","christmas","housewarming","birthday"], ["food","edible"], ["tasted fresh","generous portion","everyone fought over it"]),
 "sports": (["sports","basketball","soccer","team"], ["official-size basketball","team scarf","soccer cleats bag","stadium blanket","sports water bottle","pennant set"], ["Official","Fan","Pro"], 10, 90, 6, 99, 0, ["teen","dad","kid","friend","brother"], ["birthday","christmas"], ["active","sports"], ["great grip","good quality","my kid uses it daily"]),
 "bathroom": (["home","organization","decor"], ["bamboo shower caddy","wall planter","framed print","desk lamp","ceramic vase","floating shelf set"], ["Minimal","Scandinavian","Warm"], 12, 120, 12, 99, .2, ["friend","sister","mom","coworker"], ["housewarming","wedding","birthday"], ["home","decor"], ["looks great","easy to hang","sturdy"]),
}

ALLERGEN_CATS = {"baking":["gluten"], "snacks":["nuts","gluten","dairy"], "selfcare":["fragrance"], "tea":[], "cozy":["fragrance"]}
SMALL_PARTS = {"building","science","crafts","toddler","art","puzzles"}

def money(lo, hi):
    p = math.exp(rng.uniform(math.log(lo), math.log(hi)))
    return round(p) - 0.01 if p > 12 else round(p * 2) / 2 - 0.01

def make_reviews(cat_aspects, rating, name):
    pos = ["Bought this as a gift and it was a hit: {a}.", "{A}. Would buy again.", "Honestly better than expected, {a}.", "Arrived quickly and {a}."]
    neg = ["Decent, but the packaging was dented.", "A bit pricier than I expected for what it is.", "Works fine, though the instructions could be clearer.", "Okay overall; mine took longer to arrive than promised."]
    out = []
    for i in range(3):
        a = rng.choice(cat_aspects)
        if rng.random() < (rating - 2.5) / 2.6:
            t = rng.choice(pos).format(a=a, A=a[0].upper()+a[1:])
            stars = rng.choice([5,5,4])
        else:
            t = rng.choice(neg); stars = rng.choice([2,3,3])
        out.append({"stars": stars, "text": t})
    return out

products = []
cats = list(C)
per = 600 // len(cats)
extra = 600 - per * len(cats)
pid = 0
for i, cat in enumerate(cats):
    (interests, nouns, adjs, plo, phi, amin, amax, bprob, recips, occs, tags, aspects) = C[cat]
    n = per + (1 if i < extra else 0)
    seen = set()
    for k in range(n):
        for _ in range(50):
            noun = rng.choice(nouns); adj = rng.choice(adjs)
            nm = f"{adj} {noun}" if "set" not in noun or rng.random() < .5 else noun
            if nm in seen: nm = f"{adj} {noun} ({rng.choice(['Blue','Sage','Charcoal','Rose','Natural','Navy'])})"
            if nm not in seen: break
        seen.add(nm)
        pid += 1
        battery = rng.random() < bprob
        price = money(plo, phi)
        rating = round(min(4.95, max(2.8, rng.betavariate(8, 2) * 5 * 0.98 + 0.1)), 1)
        count = int(math.exp(rng.uniform(math.log(3), math.log(2500))))
        tg = list(tags)
        allergens = list(ALLERGEN_CATS.get(cat, []))
        allergens = [a for a in allergens if rng.random() < .45]
        if cat == "snacks" and "nuts" not in allergens: tg.append("nut-free")
        if cat == "selfcare" and "fragrance" not in allergens: tg.append("fragrance-free")
        if cat == "baking" and "gluten" not in allergens and rng.random() < .3: tg.append("gluten-free")
        if battery: tg.append("battery-powered")
        else: tg.append("no batteries")
        small_parts = cat in SMALL_PARTS and amin < 3
        if small_parts: amin = max(amin, 3)
        lo = amin; hi = amax
        desc = f"{nm.capitalize()} for {interests[0]} fans. {rng.choice(['Thoughtfully designed','Simple and reliable','A crowd-pleaser','Made to last'])}, {'battery-powered' if battery else 'no batteries needed'}."
        products.append({
            "id": f"p{pid:04d}", "name": nm[0].upper()+nm[1:], "category": cat,
            "interests": interests, "tags": tg, "description": desc,
            "price": price, "age_min": lo, "age_max": hi,
            "battery": battery, "allergens": allergens,
            "recipients": recips, "occasions": occs,
            "rating": rating, "review_count": count,
            "reviews": make_reviews(aspects, rating, nm),
            "synthetic": True, "source": "synthetic",
        })

rng.shuffle(products)
for i, p in enumerate(products): p["id"] = f"p{i+1:04d}"
json.dump(products, open("data/catalog.json", "w"), indent=1)
print(len(products), "products;", len(cats), "categories")

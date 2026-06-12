// =============================================================================
//  js/quotes.js - Ultimate High-Performance Training & Pop Culture Quotes Database
// =============================================================================

const MOTIVATIONAL_QUOTES = [
    // 👑 คลังตั้งต้นของมึง
    { text: "Keep moving forward.", author: "Coach Ponrawee" },
    { text: "No man has the right to be an amateur in the matter of physical training. It is a shame for a man to grow old without seeing the beauty and strength of which his body is capable.", author: "Socrates" },
    { text: "There is no substitute for work.", author: "Vince Lombardi" },
    { text: "Fatigue makes cowards of us all.", author: "Vince Lombardi" },
    { text: "Iron sharpens iron.", author: "Proverbs 27:17" },
    { text: "The clock is ticking. Are you becoming the person you want to be?", author: "Greg Plitt" },

    // 🏀 วงการกีฬา & S&C ระดับโลก (Sports & Training Icons)
    { text: "I've missed more than 9,000 shots in my career. I've lost almost 300 games. 26 times, I've been trusted to take the game-winning shot and missed. I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
    { text: "Hard work beats talent when talent fails to work hard.", author: "Kevin Durant" },
    { text: "If you are afraid of failure you don't deserve to be successful!", author: "Charles Barkley" },
    { text: "I hated every minute of training, but I said, 'Don't quit. Suffer now and live the rest of your life as a champion.'", author: "Muhammad Ali" },
    { text: "You can't put a limit on anything. The more you dream, the farther you get.", author: "Michael Phelps" },
    { text: "Everything negative - pressure, challenges - is all an opportunity for me to rise.", author: "Kobe Bryant" },
    { text: "The dedication to the craft is what separates the good from the great. Rest at the end, not in the middle.", author: "Kobe Bryant (Mamba Mentality)" },
    { text: "If you don't believe in yourself, nobody else will do it for you.", author: "Michael Jordan" },

    // 🎬 ภาพยนตร์ระดับตำนาน (Cinema & James Bond / Nolan Vibe)
    { text: "Why do we fall, Bruce? So that we can learn to pick ourselves up.", author: "Batman Begins (Christopher Nolan)" },
    { text: "It's not who I am underneath, but what I do that defines me.", author: "The Dark Knight" },
    { text: "Our deepest fear is not that we are inadequate. Our deepest fear is that we are powerful beyond measure.", author: "Coach Carter" },
    { text: "The right to be an elite athlete is earned every single day by doing the things that ordinary people don't want to do.", author: "Coach Carter" },
    { text: "Do or do not. There is no try.", author: "Yoda (Star Wars)" },
    { text: "The hardest choices require the strongest wills.", author: "Thanos (Avengers: Infinity War)" },
    { text: "The proper function of man is to live, not to exist. I shall not waste my days in trying to prolong them. I shall use my time.", author: "No Time to Die (James Bond)" },
    { text: "We buy things we don't need with money we don't have to impress people we don't like.", author: "Tyler Durden (Fight Club)" },

    // ⚔️ อนิเมะสายเดือด (Anime / Slam Dunk / Haikyuu!)
    { text: "If you give up, the game is already over.", author: "Coach Anzai (Slam Dunk)" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Shoyo Hinata (Haikyuu!!)" },
    { text: "Being weak is nothing to be ashamed of... Staying weak is!", author: "Fuegoleon Vermillion (Black Clover)" },
    { text: "If you don't like your destiny, don't accept it. Instead, have the courage to change it the way you want it to be.", author: "Naruto Uzumaki" },
    { text: "Push through the pain. Giving up hurts more.", author: "Vegeta (Dragon Ball Z)" },
    { text: "No matter how many people you may lose, you have no choice but to go on living. No matter how devastating the blows may be.", author: "Tanjiro Kamado (Demon Slayer)" },
    { text: "In this world, those who break the rules are scum, but those who abandon their friends are worse than scum.", author: "Kakashi Hatake (Naruto)" },

    // 📚 หนังสือ & ปรัชญาสุดคม (Books & Masterminds)
    { text: "You have power over your mind - not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius (Meditations)" },
    { text: "He who has a why to live for can bear almost any how.", author: "Friedrich Nietzsche" },
    { text: "Man is nothing else but what he makes of himself.", author: "Jean-Paul Sartre" },
    { text: "Extreme self-reliance is the only way to survive a genetically average baseline. Work while they sleep.", author: "Stuart McRobert (Hardgainer Theory)" },
    { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
    { text: "Mistakes are always forgivable, if one has the courage to admit them.", author: "Bruce Lee" }
];

// Attach to window scope globally for seamless offline accessibility across modules
window.MOTIVATIONAL_QUOTES = MOTIVATIONAL_QUOTES;

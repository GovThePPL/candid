#!/usr/bin/env python3
"""Seed a large discussion thread (~200 comments, depth 7+) to demonstrate
pagination, deep threading, and bridging badges.

Usage:
    python3 backend/scripts/seed_large_thread.py

Requires Docker services to be running (./dev.sh).
"""

import os
import uuid
import random
from datetime import datetime, timedelta, timezone

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://user:postgres@localhost:5432/candid')


def db_conn():
    return psycopg2.connect(DB_URL)


def db_execute(query, params=None):
    conn = db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
    finally:
        conn.close()


def db_query(query, params=None):
    conn = db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Fetch existing users, location, and category
# ---------------------------------------------------------------------------

def get_users():
    rows = db_query(
        "SELECT id, username, display_name FROM users WHERE status = 'active' LIMIT 40"
    )
    if len(rows) < 5:
        raise RuntimeError("Not enough users in DB. Run ./dev.sh first to seed.")
    return rows


def get_location():
    rows = db_query("SELECT id FROM location WHERE name = 'Oregon' LIMIT 1")
    if not rows:
        rows = db_query("SELECT id FROM location LIMIT 1")
    return str(rows[0]["id"])


def get_category():
    rows = db_query("SELECT id FROM position_category LIMIT 1")
    return str(rows[0]["id"])


# ---------------------------------------------------------------------------
# Comment tree definition
# ---------------------------------------------------------------------------
# Each node: {"body": str, "replies": [node, ...]}
# Replies are nested arbitrarily deep.

POST_TITLE = "Should cities invest more in public transit or road expansion?"
POST_BODY = (
    "With growing urban populations and increasing traffic congestion, cities face a "
    "fundamental infrastructure question: should limited transportation budgets go toward "
    "expanding public transit systems (buses, light rail, streetcars) or toward widening "
    "highways and building new roads?\n\n"
    "Both approaches have tradeoffs around cost, environmental impact, equity, and "
    "long-term urban planning. What does the evidence suggest, and what has worked in "
    "your community?"
)

# fmt: off
COMMENT_TREE = [
    # --- Thread 1: Transit ROI (depth 0-8) ---
    {"body": "Public transit is the clear winner for dense urban areas. Every dollar invested in transit returns $4-5 in economic activity according to APTA studies.", "replies": [
        {"body": "That $4-5 return figure is widely cited but includes indirect benefits that are hard to verify. What's the direct ROI?", "replies": [
            {"body": "The direct ROI varies by system. New York's MTA generates roughly $1.80 in direct fare revenue per dollar of operating cost. But the value is in what it enables — workforce access.", "replies": [
                {"body": "Workforce access is huge. A study in Chicago showed that transit proximity increases employment rates by 9% in low-income areas.", "replies": [
                    {"body": "That Chicago study has been contested though. The 9% figure didn't control for pre-existing neighborhood trends.", "replies": [
                        {"body": "Fair point. The updated analysis controlling for gentrification still showed a 5-6% effect, which is significant.", "replies": [
                            {"body": "5-6% employment increase is definitely significant. At that rate, a single light rail extension pays for itself through increased tax revenue within 15 years.", "replies": [
                                {"body": "That 15-year payback assumes constant ridership growth, which hasn't held true post-2020. Remote work changed the calculus.", "replies": [
                                    {"body": "Remote work is overstated. Only 30% of jobs are remote-compatible. The other 70% — service, healthcare, manufacturing — still need transit."},
                                ]},
                            ]},
                        ]},
                        {"body": "Even the contested number is better than what road expansion can show. No highway widening has ever demonstrated a net employment increase."},
                    ]},
                ]},
            ]},
            {"body": "Direct ROI is the wrong metric for public infrastructure. We don't measure the 'ROI' of sidewalks or fire departments. Transit is a public good."},
        ]},
        {"body": "Agreed. In my neighborhood, the new MAX line increased property values by 15% within two years.", "replies": [
            {"body": "Property value increases from transit are a double-edged sword — they drive displacement. The people who need transit most get priced out.", "replies": [
                {"body": "Portland's inclusionary zoning around MAX stations was supposed to prevent that. Has it worked?", "replies": [
                    {"body": "Partially. The affordable units are there, but they're a tiny fraction of total development. The net effect is still displacement."},
                    {"body": "It's worked better than doing nothing. Seattle's Link stations without affordability requirements saw 40% demographic shifts."},
                ]},
            ]},
        ]},
        {"body": "This only works in dense areas though. Most American cities aren't dense enough for cost-effective transit.", "replies": [
            {"body": "Then the answer is to increase density, not to abandon transit. Zoning reform + transit investment is the proven combination.", "replies": [
                {"body": "Easier said than done politically. NIMBYism kills density proposals in almost every suburban district."},
                {"body": "Minneapolis eliminated single-family-only zoning and the sky didn't fall. It takes political courage, not magic.", "replies": [
                    {"body": "Minneapolis is a rare success story. Most cities that tried similar reforms (like Austin's CodeNEXT) faced massive backlash and failed."},
                ]},
            ]},
        ]},
    ]},

    # --- Thread 2: Induced demand (depth 0-7) ---
    {"body": "Road expansion has diminishing returns due to induced demand. Widening I-405 in Portland actually increased congestion within 5 years.", "replies": [
        {"body": "Induced demand is real but overstated. The issue with I-405 was that they didn't add enough capacity.", "replies": [
            {"body": "This is the exact argument that has been disproven repeatedly. 'Just one more lane' is a meme for a reason.", "replies": [
                {"body": "It's a meme, but memes aren't evidence. The Katy Freeway expansion in Houston DID reduce commute times for 8 years before growth caught up.", "replies": [
                    {"body": "And then commute times exceeded pre-expansion levels, making it a $2.8 billion failure. That's exactly the point of induced demand.", "replies": [
                        {"body": "Was it a failure though? It served growing demand for nearly a decade. Infrastructure isn't supposed to last forever without upgrades.", "replies": [
                            {"body": "By that logic we should just keep widening indefinitely. At some point you hit the geometric reality that cars take too much space per person.", "replies": [
                                {"body": "This is the fundamental math. A single highway lane moves 1,600 people/hour by car vs 25,000 by rail. You literally cannot build enough road."},
                            ]},
                        ]},
                    ]},
                ]},
            ]},
        ]},
        {"body": "The research on this is overwhelming. Adding lanes to reduce congestion is like loosening your belt to lose weight.", "replies": [
            {"body": "Great analogy. The belt analogy comes from Lewis-Mogridge Position, published in 1990. We've known this for 35 years.", "replies": [
                {"body": "And yet highway departments keep building. It's not ignorance — it's that road construction is a massive industry with powerful lobbying."},
            ]},
        ]},
    ]},

    # --- Thread 3: Both-sides / balanced approach (depth 0-7) ---
    {"body": "We need both. Not every trip can be served by transit, especially in suburban and rural areas. A balanced approach is key.", "replies": [
        {"body": "This is the correct take. The either/or framing is a false dichotomy pushed by advocacy groups on both sides.", "replies": [
            {"body": "It's not a false dichotomy when road dollars actively undermine transit effectiveness. Highway expansion encourages sprawl that makes transit unviable.", "replies": [
                {"body": "This is oversimplified. Highway bypass routes can actually help transit by removing through-traffic from urban cores where transit operates.", "replies": [
                    {"body": "Can you give an example where a highway bypass actually improved urban transit performance? I'm not aware of any.", "replies": [
                        {"body": "Portland's I-205 bypass reduced traffic on inner eastside streets, which TriMet says improved bus on-time performance by 4% in the early 2000s.", "replies": [
                            {"body": "4% improvement in exchange for billions in highway spending is a terrible trade. Dedicated bus lanes would achieve the same for 1/100th the cost."},
                        ]},
                    ]},
                ]},
            ]},
            {"body": "Both-sides framing ignores that we've spent 70 years heavily favoring roads. 'Balance' would actually mean massive transit investment."},
        ]},
        {"body": "Sure, but budget constraints force choices. If we can only fund one, transit provides more benefit per dollar.", "replies": [
            {"body": "Per dollar in dense areas, sure. But what about the 40% of Americans who live in suburbs? They need road infrastructure too.", "replies": [
                {"body": "Suburbs are the result of road infrastructure, not the other way around. We built highways and then people moved to the sprawl they enabled."},
            ]},
        ]},
        {"body": "Exactly. My commute involves driving 10 miles to a park-and-ride, then taking light rail downtown. Both matter.", "replies": [
            {"body": "Park-and-ride is actually one of the least efficient transit modes. The surface parking lots waste enormous amounts of prime transit-adjacent land.", "replies": [
                {"body": "This is true. Converting park-and-rides to mixed-use development with housing is the trend, and it increases ridership while generating tax revenue."},
            ]},
        ]},
        {"body": "The 'balanced approach' often means neither system gets adequate funding. Sometimes you need to pick a priority."},
    ]},

    # --- Thread 4: BRT vs Light Rail ---
    {"body": "Light rail is incredibly expensive per mile. Bus rapid transit gives 80% of the benefits at 20% of the cost.", "replies": [
        {"body": "BRT is great but it keeps getting watered down in implementation. Most US 'BRT' systems are just painted bus lanes that cars ignore.", "replies": [
            {"body": "Richmond's Pulse BRT is a good counterexample. Fully separated lanes, level boarding, 10-minute frequency. Ridership is up 17%.", "replies": [
                {"body": "17% increase off a low base though. Richmond's transit ridership is still tiny compared to cities with rail."},
            ]},
        ]},
        {"body": "The 80/20 stat is misleading. Rail has a proven 'permanence premium' — developers build around rail stations because they can't be rerouted. Bus routes change constantly.", "replies": [
            {"body": "The permanence premium is real. Property development within 1/2 mile of rail stations is 3-4x higher than around BRT stops.", "replies": [
                {"body": "That's correlation, not causation. Rail is typically built in areas with higher development potential to begin with."},
            ]},
        ]},
    ]},

    # --- Thread 5: Equity ---
    {"body": "The equity argument for transit is compelling — lower-income households spend a disproportionate share of income on car ownership.", "replies": [
        {"body": "AAA estimates car ownership at $12,182/year average. For a family earning $30k, that's 40% of income. Transit passes are $100/month.", "replies": [
            {"body": "The $12k figure includes depreciation on new cars. Low-income households drive older cars. Real out-of-pocket is closer to $6-8k.", "replies": [
                {"body": "$6-8k is still 20-27% of a $30k income. Compare that to $1,200/year for a transit pass. The savings are transformative."},
            ]},
        ]},
        {"body": "Transit equity is about more than cost. It's about access. A car-dependent city excludes anyone who can't drive — elderly, disabled, teenagers, people with DUIs."},
    ]},

    # --- Thread 6: European comparison ---
    {"body": "Has anyone compared European transit investment levels to the US? The gap is staggering.", "replies": [
        {"body": "Germany spends about €19 billion annually on rail alone. The US equivalent would be over $100 billion.", "replies": [
            {"body": "Germany also has 4x the population density of the US. Per-capita comparison is more relevant than raw numbers."},
        ]},
        {"body": "Context matters though — European cities were built before cars, with density that supports transit naturally.", "replies": [
            {"body": "Tokyo was largely rebuilt after WWII with transit in mind. It's not about historical accident — it's about policy choices.", "replies": [
                {"body": "Tokyo's density is 16,000/sq mi vs Portland's 4,700. You can't compare transit outcomes without comparing density.", "replies": [
                    {"body": "But Portland's density IS a policy choice. We chose low-density zoning. We can choose differently."},
                ]},
            ]},
        ]},
    ]},

    # --- Thread 7: EVs (depth 0-7) ---
    {"body": "Electric vehicles will make road expansion more environmentally friendly. We should invest in EV infrastructure instead.", "replies": [
        {"body": "EVs still cause congestion, still need parking, and still kill pedestrians. They solve emissions, not urbanism.", "replies": [
            {"body": "Great point about congestion. An autonomous EV still takes up 80 sq ft of road space. A bus passenger takes up 10.", "replies": [
                {"body": "Autonomous shared EVs could change this. Instead of parking at your destination, the car leaves to pick up someone else.", "replies": [
                    {"body": "Modeling from OECD shows shared autonomous vehicles would reduce car fleet sizes by 80% but INCREASE total vehicle-miles-traveled by 10%.", "replies": [
                        {"body": "That 10% VMT increase would still be offset by zero emissions if the fleet is electric. Net positive.", "replies": [
                            {"body": "Zero tailpipe emissions. Tire and brake particulates, road surface wear, and manufacturing emissions don't go away. EVs are cleaner, not clean."},
                        ]},
                    ]},
                ]},
            ]},
        ]},
        {"body": "The grid can't handle mass EV adoption yet. We'd need to double electricity generation capacity.", "replies": [
            {"body": "That's an overestimate. If all US cars were EVs overnight, electricity demand would increase 25%, not 100%. And the transition takes decades."},
        ]},
        {"body": "EVs are part of the solution but they don't address equity. Not everyone can afford a $40k car.", "replies": [
            {"body": "Used EV prices are dropping fast. A 2019 Nissan Leaf is under $15k now. Battery degradation concerns are also proving overblown."},
        ]},
    ]},

    # --- Thread 8: TOD ---
    {"body": "Transit-oriented development has been transformative in cities like Portland and Denver. The land use benefits compound over decades.", "replies": [
        {"body": "Denver's RTD FasTracks is the cautionary tale. $4.7 billion in cost overruns, half the lines delayed indefinitely, and ridership projections were wildly optimistic.", "replies": [
            {"body": "The cost overruns are real, but the completed lines have driven $15+ billion in transit-adjacent development. That's 3x the total cost of the program."},
        ]},
    ]},

    # --- Thread 9: Safety ---
    {"body": "Safety is underrated in this debate. Transit is dramatically safer per passenger-mile than personal vehicles.", "replies": [
        {"body": "The safety statistics are stark: 0.11 fatalities per billion passenger-miles for transit vs 7.28 for cars. That's a 66x difference.", "replies": [
            {"body": "Per passenger-mile is the key qualifier. Per trip, the difference is smaller because transit trips tend to be longer.", "replies": [
                {"body": "Even per trip, transit is 10x safer. And pedestrians are safer in transit-oriented neighborhoods because of lower car speeds and better infrastructure."},
            ]},
        ]},
    ]},

    # --- Thread 10: Political reality ---
    {"body": "The political reality is that road projects get funded more easily because every voter drives, but not everyone rides transit.", "replies": [
        {"body": "This is changing. The Infrastructure Investment and Jobs Act allocated record transit funding. Voter attitudes are shifting, especially among under-40s."},
        {"body": "The highway lobby is one of the most powerful in DC. Construction companies, oil industry, auto manufacturers — they all push for road spending."},
    ]},

    # --- Thread 11: Remote work ---
    {"body": "Remote work has permanently changed commute patterns. We should rethink transit routes before investing billions in old models.", "replies": [
        {"body": "Post-pandemic ridership data supports this. Transit agencies need to pivot to all-day frequent service instead of peak-hour commuter runs.", "replies": [
            {"body": "TriMet already made this shift. They cut peak-only express routes and added frequency on core all-day lines. Ridership recovery is outpacing peers."},
        ]},
        {"body": "Remote work is concentrated in white-collar jobs. Service workers, healthcare, retail — they still commute.", "replies": [
            {"body": "Exactly. And these are the workers who can least afford cars. Transit investment is an equity investment in essential workers."},
        ]},
    ]},

    # --- Thread 12: Congestion pricing ---
    {"body": "Congestion pricing (like London and Stockholm) is a better solution than either building more roads or more transit.", "replies": [
        {"body": "NYC's congestion pricing launched in 2025. Early data shows a 15% traffic reduction in the zone, which is in line with London's results.", "replies": [
            {"body": "The revenue earmarked for transit improvements is the key benefit. Congestion pricing funds transit AND reduces the need for road expansion simultaneously."},
        ]},
        {"body": "Congestion pricing is regressive unless you exempt low-income drivers or use the revenue for transit alternatives they can actually use.", "replies": [
            {"body": "Stockholm's system provides income-based discounts and free transit passes for qualifying households. The equity concerns are solvable."},
        ]},
    ]},

    # --- Thread 13: Accessibility ---
    {"body": "Accessibility matters — our transit system is terrible for people with disabilities. Paratransit is underfunded everywhere.", "replies": [
        {"body": "ADA compliance in transit is a legal mandate but an unfunded one. Paratransit costs $30-50 per trip while fixed route costs $3-5.", "replies": [
            {"body": "That cost disparity is exactly why accessible fixed-route transit is the real solution. Low-floor buses, level boarding, audio announcements — all reduce paratransit dependency."},
        ]},
    ]},

    # --- Thread 14: Construction jobs ---
    {"body": "The construction jobs argument cuts both ways. Both transit and road projects create employment.", "replies": [
        {"body": "Transit projects create 30% more jobs per dollar spent than highway projects according to Smart Growth America.", "replies": [
            {"body": "That's because transit projects are more labor-intensive and less materials-intensive. Road projects spend more on asphalt and concrete."},
        ]},
    ]},

    # --- Thread 15: Self-driving (depth 0-7) ---
    {"body": "Self-driving cars will make this entire debate obsolete within 20 years. We shouldn't lock in expensive rail infrastructure.", "replies": [
        {"body": "People have been saying self-driving is '20 years away' for 20 years. Meanwhile, we need solutions now.", "replies": [
            {"body": "The sunk cost argument is bad though. We should plan for the future, not keep investing in dying technology.", "replies": [
                {"body": "Rail isn't 'dying technology.' It's been around for 200 years and carries more passengers than ever. That's the opposite of dying.", "replies": [
                    {"body": "Horses were around for 5,000 years before cars replaced them in 30. Longevity doesn't guarantee permanence.", "replies": [
                        {"body": "Cars replaced horses because they were faster, cheaper, and more convenient. Self-driving cars offer none of those advantages over rail.", "replies": [
                            {"body": "They offer door-to-door service, which rail never can. That's the convenience factor that makes cars dominant despite being worse in every other metric."},
                        ]},
                    ]},
                ]},
            ]},
        ]},
        {"body": "Even with autonomy, single-occupancy vehicles are incredibly space-inefficient compared to a bus or train."},
        {"body": "Autonomous transit vehicles could be the best of both worlds — personalized routes with shared infrastructure."},
    ]},

    # --- Thread 16: Climate ---
    {"body": "Climate change makes this urgent. Transportation is the #1 source of emissions in the US. Transit reduces per-capita emissions by 45%.", "replies": [
        {"body": "The 45% figure understates it. When you factor in land use changes from transit-oriented development, it's closer to 60%.", "replies": [
            {"body": "And if you include the embodied carbon in road construction vs rail, the gap widens further. Concrete is 8% of global CO2 emissions."},
        ]},
        {"body": "Climate urgency means we can't wait 20 years for rail to be built. We need BRT and protected bike lanes NOW — they can be deployed in months."},
    ]},

    # --- Thread 17: Zoning ---
    {"body": "Mixed-use zoning reform would reduce the NEED for either. If people can live near work, transit and roads both matter less.", "replies": [
        {"body": "Zoning reform is necessary but not sufficient. Even in mixed-use areas, people travel for school, healthcare, recreation. Transit still matters.", "replies": [
            {"body": "True, but reducing average trip distance from 12 miles to 3 miles makes walking, biking, and local transit viable. The car dependency breaks."},
        ]},
    ]},

    # --- Thread 18: Japan ---
    {"body": "Japan's rail system shows what's possible when you truly commit to transit. Their Shinkansen network is profitable AND popular.", "replies": [
        {"body": "Japan's rail is profitable because they own the real estate around stations. JR East makes more from its malls and apartments than from fares.", "replies": [
            {"body": "The Hong Kong MTR uses the same model — 'rail plus property.' Why hasn't any US transit agency adopted this?", "replies": [
                {"body": "US transit agencies are legally structured as government authorities that can't engage in real estate development. The enabling legislation would need to change.", "replies": [
                    {"body": "Denver's RTD has started doing this through joint development agreements. It's legally clunky but possible. The results around Union Station are impressive."},
                ]},
            ]},
        ]},
    ]},

    # --- Thread 19: Maintenance costs ---
    {"body": "The maintenance costs of roads are bankrupting small cities. Strong Towns has great data on this — the suburban experiment is a fiscal disaster.", "replies": [
        {"body": "The math is devastating. Lafayette, LA found that their road maintenance obligations exceed their total tax revenue by 3x. They literally can't afford their infrastructure.", "replies": [
            {"body": "Lafayette is an extreme case but the pattern is universal. Suburban development generates less tax revenue per acre than it costs to maintain."},
        ]},
        {"body": "Gas taxes haven't been raised federally since 1993. Meanwhile construction costs have tripled. Roads are increasingly funded by general revenue — a subsidy."},
    ]},

    # --- Thread 20: Micromobility ---
    {"body": "Micromobility (e-bikes, scooters) deserves more investment than either option. It solves the last-mile problem that kills transit ridership.", "replies": [
        {"body": "E-bikes are genuinely transformative. In the Netherlands, e-bikes have a modal share that rivals cars for trips under 10 km.", "replies": [
            {"body": "The Netherlands also has the infrastructure to support safe cycling. You can't compare e-bike adoption without comparing protected lane networks."},
        ]},
    ]},

    # --- Thread 21: Ridership decline ---
    {"body": "Our city just passed a transit bond and ridership is still declining. Maybe the problem isn't funding but service design.", "replies": [
        {"body": "Service design is everything. Houston redesigned their entire bus network for frequency over coverage and ridership went up 7%.", "replies": [
            {"body": "Houston's redesign is the gold standard case study. They didn't add a single bus — they just rearranged routes to maximize transfers and frequency."},
        ]},
        {"body": "This resonates. We voted for a $2.4 billion bond and the new lines won't open for 8 years. Meanwhile, service was cut.", "replies": [
            {"body": "This is the #1 failure mode of US transit: spending billions on capital projects while starving operating budgets. Voters want shiny trains, not frequent buses."},
        ]},
    ]},

    # --- Thread 22: Freight ---
    {"body": "Freight logistics require roads regardless. We can't ship goods on light rail. Let's be practical about infrastructure needs.", "replies": [
        {"body": "Nobody is proposing zero road investment. The argument is about marginal dollars. Freight can use existing roads without widening.", "replies": [
            {"body": "Actually, freight IS moving to rail. Intermodal rail freight has grown 50% since 2000. It's cheaper and more fuel-efficient for long haul."},
        ]},
    ]},

    # --- Thread 23: Fix the basics ---
    {"body": "Transit works when it's fast, frequent, and reliable. Most US transit fails on all three. Fix the basics before expanding.", "replies": [
        {"body": "This is the most practical take in the whole thread. Dedicated bus lanes, signal priority, and 10-minute frequency would transform most US bus systems.", "replies": [
            {"body": "And it's cheap! Bus signal priority costs $30-50k per intersection. A city could do their entire core network for under $5 million."},
        ]},
    ]},

    # --- Thread 24: Bike lanes ---
    {"body": "Protected bike lanes have better ROI than either transit expansion or road widening for trips under 5 miles.", "replies": [
        {"body": "The data from Bogota's ciclovias is remarkable. Protected bike infrastructure costs $1M/mile vs $50M/mile for light rail and $100M+/mile for highway.", "replies": [
            {"body": "Cost per mile is misleading. You need to compare cost per passenger-mile. A highway lane moves far more people than a bike lane."},
            {"body": "In urban areas with proper bike infrastructure, bike lanes actually move MORE people per lane-width per hour than car lanes. Copenhagen has the data."},
        ]},
    ]},

    # --- Thread 25: Housing + Transit ---
    {"body": "The housing crisis is intertwined with transit. Without affordable housing near transit stops, the investment is wasted.", "replies": [
        {"body": "Vienna's social housing model integrates transit planning with housing development. 60% of Viennese live in subsidized housing, most within 500m of transit."},
        {"body": "This is why inclusionary zoning around transit stations should be federal policy, not left to each city's discretion."},
    ]},

    # --- Thread 26: Personal experience ---
    {"body": "I lived in a city with great transit (Seoul) and one without (Houston). The quality of life difference is enormous.", "replies": [
        {"body": "Same experience. Moved from Tokyo to Atlanta. Going from 2-minute headways to 30-minute buses that may or may not show up was culture shock."},
    ]},

    # --- Thread 27: Cost of congestion ---
    {"body": "Data from the Texas Transportation Institute shows that congestion costs US drivers $87 billion annually. We need solutions.", "replies": [
        {"body": "The TTI methodology is questionable. They define 'congestion cost' as any speed below free-flow, which is like calling 'cost of having neighbors' a housing metric."},
    ]},

    # --- Thread 28: Telecommuting ---
    {"body": "Why not invest in telecommuting infrastructure instead? Fiber internet to every home would reduce the need for physical transit.", "replies": [
        {"body": "Broadband investment is important but it's a complement to transit, not a substitute. You can't telecommute to a restaurant, hospital, or school."},
    ]},

    # --- Thread 29: School transport ---
    {"body": "School transportation is the hidden cost. Better transit means fewer school buses and more independence for teenagers.", "replies": [
        {"body": "In Japan, kids ride the subway to school from age 6. It's perfectly safe because the system is designed for everyone, not just commuters."},
    ]},

    # --- Thread 30: Agency management ---
    {"body": "Public transit agencies are terribly managed. Before giving them more money, we should reform governance and accountability.", "replies": [
        {"body": "Some agencies are poorly managed. Others like WMATA have improved dramatically after governance reform. Blanket statements about 'all agencies' aren't helpful.", "replies": [
            {"body": "WMATA improved because Congress literally threatened to cut funding. External accountability works, internal reform doesn't."},
        ]},
    ]},

    # --- Thread 31: Suburbs + cars ---
    {"body": "The suburbs were built around cars. You can't retrofit transit into sprawl without also changing land use policy.", "replies": [
        {"body": "This is the fundamental truth. Transit in sprawl is like putting a band-aid on a broken leg. You need the land use reform first.", "replies": [
            {"body": "But you need transit to make density viable! Dense neighborhoods without transit are just congested neighborhoods. It's a chicken-and-egg problem.", "replies": [
                {"body": "The solution is to do both simultaneously. Upzone corridors AND build transit along them. That's what Curitiba did successfully in the 1970s."},
            ]},
        ]},
    ]},

    # --- Thread 32: Bus driver perspective (depth 0-8) ---
    {"body": "I'm a bus driver and the biggest issue isn't funding — it's operator shortages. We can't run service without drivers.", "replies": [
        {"body": "Thank you for sharing this perspective. What would help with recruitment and retention?", "replies": [
            {"body": "Better pay, predictable schedules, and protected lanes so drivers don't sit in traffic. All of those require political will.", "replies": [
                {"body": "The schedule issue is underappreciated. Split shifts are brutal — work 6am-9am, off for 4 hours, work 3pm-7pm. No one wants that life.", "replies": [
                    {"body": "Split shifts exist because transit has peak demand. More frequent all-day service would smooth the labor demand curve too.", "replies": [
                        {"body": "All-day frequency requires more buses AND more drivers though. You'd need 30-40% more operators to run 10-minute frequency all day.", "replies": [
                            {"body": "Yes, and that's the investment case. Pay drivers well, give them good schedules, and the recruitment problem solves itself. Seattle proved this.", "replies": [
                                {"body": "Seattle's King County Metro raised starting pay to $32/hour and filled their entire hiring pipeline in 6 months. Money works."},
                            ]},
                        ]},
                    ]},
                ]},
            ]},
        ]},
        {"body": "This is a huge issue nationwide. The average bus driver salary hasn't kept up with cost of living.", "replies": [
            {"body": "In Portland, starting TriMet operators earn $22/hour. Amazon warehouse workers earn $21. Why would anyone choose the harder job for $1 more?"},
        ]},
        {"body": "Automation of some routes could help with the shortage while keeping experienced drivers on complex urban routes.", "replies": [
            {"body": "Autonomous buses are being tested in a handful of cities but they're limited to low-speed, simple routes. We're decades from replacing urban drivers."},
        ]},
    ]},

    # --- Thread 33: Additional root comments for pagination depth ---
    {"body": "Nobody talks about the aesthetic dimension. European cities with trams are beautiful. Highway-dominated cities feel hostile and inhuman."},
    {"body": "Insurance costs should factor in. Transit riders pay zero vehicle insurance. The average American pays $1,771/year for auto insurance."},
    {"body": "The US military considers oil dependence a national security threat. Reducing car dependence through transit addresses energy security."},
    {"body": "Transit agencies should be required to publish real-time performance dashboards. Transparency drives accountability and public trust."},
    {"body": "Night service is the forgotten frontier. Most US transit stops running at 10pm, stranding shift workers, hospitality staff, and people going out."},
    {"body": "Water infrastructure competes with transit for the same municipal bonds. In cities with aging pipes, transit often loses the funding battle."},
]
# fmt: on


# ---------------------------------------------------------------------------
# Tree insertion helpers
# ---------------------------------------------------------------------------

_time_counter = 0  # global minute counter for staggered creation times


def insert_comment_tree(post_id, nodes, parent_id, parent_path, depth,
                        base_time, users, all_inserted):
    """Recursively insert a comment tree. Returns list of (id, path, depth)."""
    global _time_counter
    for node in nodes:
        cid = str(uuid.uuid4())
        _time_counter += 1
        author = users[_time_counter % len(users)]
        created = base_time + timedelta(minutes=_time_counter)
        path = f"{parent_path}/{cid}" if parent_path else cid

        db_execute("""
            INSERT INTO comment (id, post_id, parent_comment_id, creator_user_id,
                                 body, path, depth, status, created_time)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s)
        """, (cid, post_id, parent_id, str(author["id"]),
              node["body"], path, depth, created))

        if parent_id:
            db_execute(
                "UPDATE comment SET child_count = child_count + 1 WHERE id = %s",
                (parent_id,)
            )

        all_inserted.append((cid, path, depth))

        if node.get("replies"):
            insert_comment_tree(post_id, node["replies"], cid, path,
                                depth + 1, base_time, users, all_inserted)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global _time_counter
    _time_counter = 0

    print("Fetching existing data...")
    users = get_users()
    location_id = get_location()
    category_id = get_category()

    print(f"Found {len(users)} users, location={location_id[:8]}..., category={category_id[:8]}...")

    # Delete previous seed if it exists
    existing = db_query(
        "SELECT id FROM post WHERE title = %s LIMIT 1", (POST_TITLE,)
    )
    if existing:
        old_id = str(existing[0]["id"])
        print(f"Deleting previous seed post {old_id[:8]}...")
        db_execute("DELETE FROM comment_vote WHERE comment_id IN (SELECT id FROM comment WHERE post_id = %s)", (old_id,))
        db_execute("DELETE FROM comment WHERE post_id = %s", (old_id,))
        db_execute("DELETE FROM post WHERE id = %s", (old_id,))

    # Create the post
    post_id = str(uuid.uuid4())
    creator = random.choice(users)
    base_time = datetime.now(timezone.utc) - timedelta(hours=48)

    db_execute("""
        INSERT INTO post (id, creator_user_id, location_id, category_id, post_type,
                          title, body, status, created_time)
        VALUES (%s, %s, %s, %s, 'discussion', %s, %s, 'active', %s)
    """, (post_id, str(creator["id"]), location_id, category_id,
          POST_TITLE, POST_BODY, base_time))

    print(f"Created post: {post_id}")

    # Insert entire comment tree recursively
    all_inserted = []  # list of (id, path, depth)
    insert_comment_tree(post_id, COMMENT_TREE, None, None, 0,
                        base_time, users, all_inserted)

    comment_count = len(all_inserted)
    max_depth = max(d for _, _, d in all_inserted)
    print(f"Inserted {comment_count} comments (max depth: {max_depth})")

    # Update post comment_count
    db_execute(
        "UPDATE post SET comment_count = %s WHERE id = %s",
        (comment_count, post_id)
    )

    # -----------------------------------------------------------------------
    # Votes
    # -----------------------------------------------------------------------
    all_cids = [cid for cid, _, _ in all_inserted]
    print(f"Adding votes to {len(all_cids)} comments...")

    # Baseline: 1-4 random upvotes per comment
    for cid in all_cids:
        num_votes = random.randint(1, 4)
        voters = random.sample(users, min(num_votes, len(users)))
        for voter in voters:
            db_execute("""
                INSERT INTO comment_vote (comment_id, user_id, vote_type, weight)
                VALUES (%s, %s, 'upvote', 1.0)
                ON CONFLICT (comment_id, user_id) DO NOTHING
            """, (cid, str(voter["id"])))

    # Popular comments: 10-20 extra votes for ~15% of comments (spread across depths)
    bridging_cids = []
    popular_count = max(1, len(all_cids) // 7)
    popular_picks = random.sample(all_inserted, min(popular_count, len(all_inserted)))
    for cid, _, _ in popular_picks:
        bridging_cids.append(cid)
        num_extra = random.randint(10, 20)
        voters = random.sample(users, min(num_extra, len(users)))
        for voter in voters:
            vote_type = 'upvote' if random.random() < 0.92 else 'downvote'
            db_execute("""
                INSERT INTO comment_vote (comment_id, user_id, vote_type, weight)
                VALUES (%s, %s, %s, 1.0)
                ON CONFLICT (comment_id, user_id) DO NOTHING
            """, (cid, str(voter["id"]), vote_type))

    # -----------------------------------------------------------------------
    # Recalculate denormalized vote counts
    # -----------------------------------------------------------------------
    print("Recalculating vote counts...")
    for cid in all_cids:
        db_execute("""
            UPDATE comment SET
                upvote_count = (SELECT count(*) FROM comment_vote
                                WHERE comment_id = %s AND vote_type = 'upvote'),
                downvote_count = (SELECT count(*) FROM comment_vote
                                  WHERE comment_id = %s AND vote_type = 'downvote'),
                weighted_upvotes = COALESCE(
                    (SELECT sum(weight) FROM comment_vote
                     WHERE comment_id = %s AND vote_type = 'upvote'), 0),
                weighted_downvotes = COALESCE(
                    (SELECT sum(weight) FROM comment_vote
                     WHERE comment_id = %s AND vote_type = 'downvote'), 0)
            WHERE id = %s
        """, (cid, cid, cid, cid, cid))

    # Wilson score
    db_execute("""
        UPDATE comment SET score = CASE
            WHEN (weighted_upvotes + weighted_downvotes) = 0 THEN 0
            ELSE (
                (weighted_upvotes + 1.9208) / (weighted_upvotes + weighted_downvotes + 3.8416)
                - 1.96 * sqrt(
                    (weighted_upvotes * weighted_downvotes) / (weighted_upvotes + weighted_downvotes)
                    + 0.9604
                ) / (weighted_upvotes + weighted_downvotes + 3.8416)
            )
        END
        WHERE post_id = %s
    """, (post_id,))

    # -----------------------------------------------------------------------
    # Bridging scores (mf_intercept)
    # -----------------------------------------------------------------------
    print(f"Setting bridging scores on {len(bridging_cids)} popular comments...")
    for cid in bridging_cids:
        mf_intercept = round(random.uniform(0.3, 0.8), 3)
        db_execute(
            "UPDATE comment SET mf_intercept = %s WHERE id = %s",
            (mf_intercept, cid)
        )

    # Some non-popular comments get low/negative intercepts
    for cid in all_cids:
        if cid not in bridging_cids and random.random() < 0.25:
            mf_intercept = round(random.uniform(-0.2, 0.2), 3)
            db_execute(
                "UPDATE comment SET mf_intercept = %s WHERE id = %s",
                (mf_intercept, cid)
            )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    stats = db_query("""
        SELECT
            count(*) as total,
            count(*) FILTER (WHERE parent_comment_id IS NULL) as roots,
            max(depth) as max_depth,
            count(*) FILTER (WHERE mf_intercept >= 0.3
                AND (upvote_count + downvote_count) >= 5) as bridging,
            avg(upvote_count)::int as avg_upvotes
        FROM comment WHERE post_id = %s
    """, (post_id,))

    depth_dist = db_query("""
        SELECT depth, count(*) as cnt
        FROM comment WHERE post_id = %s
        GROUP BY depth ORDER BY depth
    """, (post_id,))

    s = stats[0]
    print(f"\n{'='*50}")
    print(f"Post ID: {post_id}")
    print(f"Total comments: {s['total']}")
    print(f"Root comments: {s['roots']} (pagination triggers at >20)")
    print(f"Max depth: {s['max_depth']}")
    print(f"Bridging badge eligible: {s['bridging']}")
    print(f"Average upvotes: {s['avg_upvotes']}")
    print(f"\nDepth distribution:")
    for row in depth_dist:
        bar = '#' * row['cnt']
        print(f"  depth {row['depth']}: {row['cnt']:3d} {bar}")
    print(f"\nAPI: GET /api/v1/posts/{post_id}/comments?limit=20")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()

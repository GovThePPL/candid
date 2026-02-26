"""
Comment body templates organized by belief_system × stance.

Stances:
  supportive — agrees with the post's general direction
  opposing   — disagrees, pushes back
  nuanced    — acknowledges complexity, partial agreement

Placeholders use {topic_vocabulary} keys from session JSON files.
"""

COMMENT_TEMPLATES = {
    # =========================================================================
    # LEFT-LEANING (progressive, liberal, social_democrat, socialist)
    # =========================================================================
    "progressive": {
        "supportive": [
            "This is exactly right. We need much stronger action on {topic_noun}.",
            "Absolutely. The status quo on {topic_noun} is failing the people who need help most.",
            "I've been saying this for years. {topic_noun} is a justice issue, plain and simple.",
            "The evidence supports this. Every study I've seen confirms that progressive approaches to {topic_noun} work.",
            "This resonates with me. The system is designed to benefit {stakeholder} at the expense of everyday people.",
            "Couldn't agree more. We need to center the most marginalized voices in this conversation.",
            "Strong agree. And we need to move faster — people are suffering while we debate.",
            "This is the kind of bold thinking we need. Incrementalism hasn't worked for {topic_noun}.",
        ],
        "opposing": [
            "I disagree with the framing here. {topic_noun} isn't just about economics — it's about power and who has it.",
            "This approach would actually make things worse for the people it claims to help.",
            "Market-based solutions have failed for {topic_noun}. We need systemic change, not band-aids.",
            "This is a half-measure at best. We need fundamental restructuring, not tweaks around the edges.",
            "I hear what you're saying, but this ignores the structural inequalities at the root of {topic_adj} problems.",
            "Without addressing the systemic issues, this proposal just reshuffles deck chairs.",
        ],
        "nuanced": [
            "I mostly agree, but we also need to consider the impact on communities that are already marginalized.",
            "There's a good core idea here, but the implementation needs to prioritize equity.",
            "I see the appeal of this approach, but it doesn't go far enough on {topic_noun}.",
            "You make valid points, though I'd push further on the structural reforms needed.",
            "I want to agree, but I worry this framing lets the real power players off the hook.",
            "There's truth here. The question is whether reform or transformation is the right path.",
        ],
    },
    "liberal": {
        "supportive": [
            "Well said. Evidence-based policy is what we need here.",
            "I agree. Smart regulation can make {topic_noun} work better for everyone.",
            "This aligns with what the research shows about effective {topic_adj} policy.",
            "Good point. We can preserve what works while fixing what's broken.",
            "I support this approach. It's practical and evidence-based.",
            "This is the kind of thoughtful analysis we need more of in this discussion.",
            "Agree. Investing in {topic_noun} isn't just the right thing to do — it makes economic sense.",
        ],
        "opposing": [
            "I'm skeptical. The approach you're describing hasn't worked well in practice.",
            "The data doesn't support this. Other approaches to {topic_noun} have shown better results.",
            "I understand the appeal, but this could have unintended consequences that hurt the people we're trying to help.",
            "This oversimplifies a complex issue. {topic_noun} requires nuanced solutions, not ideological ones.",
            "I respectfully disagree. The evidence points in a different direction.",
        ],
        "nuanced": [
            "There's merit to this perspective, but I'd want to see more data before committing to it.",
            "I agree with the diagnosis but not the prescription. The real question is how to implement this effectively.",
            "You raise valid concerns. I think the answer lies somewhere between the extremes on {topic_noun}.",
            "Interesting point. I'd add that we need to consider the costs alongside the benefits.",
            "I'm partially persuaded. Can you point to specific examples where this has worked?",
            "This is a good start, but I think we need to be more specific about the policy mechanisms.",
        ],
    },
    "social_democrat": {
        "supportive": [
            "Exactly. A strong social safety net benefits everyone, not just the people who use it directly.",
            "This mirrors what works in Northern Europe. Proven models exist — we just need the will to implement them.",
            "Good framing. Public investment in {topic_noun} creates shared prosperity.",
            "Agree. The Nordic approach to {topic_noun} shows this is achievable.",
            "This is the kind of balanced, evidence-based approach we need.",
            "Well put. The question isn't whether we can afford to invest in {topic_noun} — it's whether we can afford not to.",
        ],
        "opposing": [
            "This approach is too market-oriented. {topic_noun} is a public good that deserves public investment.",
            "Deregulation in this area would be a disaster. We need more oversight, not less.",
            "I disagree. Cutting corners on {topic_noun} costs more in the long run than doing it right.",
            "This privileges efficiency over equity. Both matter for {topic_noun}.",
            "We've tried the minimal-government approach to {topic_noun}. It didn't work.",
        ],
        "nuanced": [
            "I see the appeal, but international comparisons suggest a different approach would work better.",
            "There's something here, but we need to add stronger worker protections to make it work.",
            "I partly agree. The key is getting the balance right between markets and regulation.",
            "Good points, though I'd emphasize the role of strong public institutions more.",
            "This is thoughtful. My concern is that it doesn't adequately address inequality.",
        ],
    },
    "socialist": {
        "supportive": [
            "Yes. This is fundamentally about who controls {topic_noun} — the people or corporations.",
            "Exactly right. {topic_noun} should serve the public interest, not private profit.",
            "This gets at the root cause. The problem is the system itself.",
            "Solidarity on this. Working people deserve better than what {topic_noun} currently delivers.",
            "Absolutely. We need democratic control over {topic_noun}, not corporate control.",
        ],
        "opposing": [
            "This doesn't go far enough. You can't reform a fundamentally broken system — you need to replace it.",
            "Band-aids on a broken system. {topic_noun} needs wholesale transformation, not minor adjustments.",
            "This still centers corporate interests. We need to ask: who profits from the current {topic_adj} system?",
            "Reformism has failed for {topic_noun}. We need structural change.",
            "I appreciate the sentiment, but this approach still operates within a framework that's part of the problem.",
        ],
        "nuanced": [
            "I agree with the direction but think we need a more transformative approach.",
            "There's a kernel of truth here, though I'd frame it differently.",
            "I see this as a step in the right direction, but only a step. The destination needs to be much further.",
            "You're identifying real problems. I just think the solutions need to be more fundamental.",
        ],
    },

    # =========================================================================
    # CENTER (moderate, centrist)
    # =========================================================================
    "moderate": {
        "supportive": [
            "I think this strikes the right balance. Pragmatism over ideology.",
            "Good analysis. The truth on {topic_noun} is usually somewhere in the middle.",
            "I appreciate this balanced take. Both sides have valid points on {topic_noun}.",
            "Agree. We need solutions that can actually get bipartisan support.",
            "This is the kind of practical thinking we need. Not everything has to be ideological.",
            "Well said. The best {topic_adj} policies take the best ideas from both sides.",
            "I like the pragmatic approach here. Perfect shouldn't be the enemy of good.",
        ],
        "opposing": [
            "This is too extreme in one direction. We need to find middle ground on {topic_noun}.",
            "I understand the passion, but this approach ignores legitimate concerns from the other side.",
            "This kind of all-or-nothing thinking is why we can't make progress on {topic_noun}.",
            "There are good arguments on both sides here. Dismissing one entirely isn't productive.",
            "I think this overstates the case. The reality of {topic_noun} is more nuanced.",
        ],
        "nuanced": [
            "There's truth on both sides of this {topic_noun} debate. The challenge is finding workable compromises.",
            "I see merit in this argument, but I also understand why others disagree.",
            "Interesting perspective. I think the answer involves elements from several approaches.",
            "I'm not fully convinced either way. The evidence on {topic_noun} seems genuinely mixed.",
            "This is a fair point, but I'd want to hear the counterargument before making up my mind.",
            "Both camps have a point here. Can we synthesize the best elements?",
        ],
    },
    "centrist": {
        "supportive": [
            "This is a sensible, realistic approach. I'm tired of ideological posturing on {topic_noun}.",
            "Agree. Let's focus on what actually works rather than what sounds good in a campaign speech.",
            "Practical and achievable. This is how you make progress.",
            "I support this. It's the kind of bipartisan approach {location_name} needs.",
            "Sensible. Not everything about {topic_noun} needs to be a political battle.",
            "This is refreshingly practical. Thank you for focusing on solutions.",
        ],
        "opposing": [
            "I think this is more ideological than practical. What does the data actually show?",
            "This sounds good in theory but ignores real-world constraints in {location_name}.",
            "I'm skeptical of sweeping claims about {topic_noun}. Show me the evidence.",
            "Both sides are oversimplifying this. The reality is more complicated.",
            "I don't think this approach accounts for the real trade-offs involved.",
        ],
        "nuanced": [
            "There's something here, but I'd want to see a cost-benefit analysis before supporting it.",
            "I lean toward agreeing, but the implementation details matter a lot.",
            "Fair points. I'd just add that we should test any approach before scaling it.",
            "I'm open to this direction but want to make sure we're not creating new problems.",
            "Interesting. I think the answer depends heavily on local conditions in {location_name}.",
        ],
    },

    # =========================================================================
    # RIGHT-LEANING (libertarian, conservative, populist, traditionalist)
    # =========================================================================
    "libertarian": {
        "supportive": [
            "Individual liberty should be the foundation. People should be free to make their own choices about {topic_noun}.",
            "The market will handle this better than government mandates. Competition drives quality and innovation.",
            "Agree. Less government intervention in {topic_noun} means better outcomes for everyone.",
            "Personal responsibility and free choice — that's how you solve {topic_adj} issues.",
            "This is the right approach. Let people and markets find solutions, not bureaucrats.",
            "Exactly. Government regulation of {topic_noun} creates more problems than it solves.",
        ],
        "opposing": [
            "More government isn't the answer. Every regulation creates new distortions in the market.",
            "This would restrict individual freedom without actually improving {topic_noun}.",
            "Government programs for {topic_noun} have a terrible track record. Why expand what doesn't work?",
            "The solution to {topic_adj} problems isn't more bureaucracy — it's more freedom.",
            "This ignores the role of government failure in creating {topic_adj} problems in the first place.",
        ],
        "nuanced": [
            "I see the problem, but government intervention in {topic_noun} often makes things worse.",
            "There might be a role for limited government action here, but it needs to be narrowly targeted.",
            "I agree this is a real issue, but I'd prefer market-based solutions to {topic_noun}.",
            "You raise valid concerns. I just think the mechanism for addressing them should be voluntary, not mandated.",
            "The analysis is sound, but the proposed solution gives government too much power.",
        ],
    },
    "conservative": {
        "supportive": [
            "Agree. Proven, traditional approaches to {topic_noun} work better than radical experiments.",
            "This is common sense. We don't need to reinvent the wheel on {topic_noun}.",
            "Personal responsibility and community — that's how you address {topic_adj} challenges.",
            "The private sector does this better than government. Every time.",
            "I appreciate the focus on what actually works rather than utopian thinking.",
            "Good point. Strong families and communities are the real answer to {topic_adj} problems.",
            "Fiscal responsibility matters. We can improve {topic_noun} without breaking the bank.",
        ],
        "opposing": [
            "This would cost taxpayers a fortune with no guarantee of results.",
            "Government overreach on {topic_noun} is how we got into this mess. More won't fix it.",
            "Where's the accountability? Big government programs for {topic_noun} always end up wasteful.",
            "I fundamentally disagree with the premise. The market handles {topic_noun} better than any government program.",
            "This ignores the real-world consequences. When has a massive government {topic_adj} program actually worked?",
        ],
        "nuanced": [
            "I'm open to reform, but it needs to be fiscally responsible and respect individual liberty.",
            "There's a legitimate problem here, but the proposed solution is bigger than necessary.",
            "I can see both sides. The key is finding an approach that doesn't grow government or raise taxes.",
            "Fair point, though I'd emphasize local solutions over federal mandates for {topic_noun}.",
            "I agree something needs to change, but let's be careful not to create new problems with {topic_adj} policy.",
        ],
    },
    "populist": {
        "supportive": [
            "Finally, someone talking about what real people deal with on {topic_noun}. Not the elites, real people.",
            "The working class gets forgotten in these {topic_noun} debates. This speaks to our concerns.",
            "Agree. The system is rigged against ordinary people when it comes to {topic_noun}.",
            "Both parties have failed us on {topic_noun}. We need real change, not more promises.",
            "This is what happens when you listen to regular folks instead of think tanks and lobbyists.",
            "Common sense solutions. That's all we're asking for on {topic_noun}.",
        ],
        "opposing": [
            "This sounds like more of the same elite-driven policy that ignores working people.",
            "Nobody asked for this. Regular people want simpler, more direct solutions to {topic_adj} problems.",
            "The experts keep getting {topic_noun} wrong. Maybe it's time to listen to the people who actually deal with it.",
            "Another complicated proposal that benefits insiders. How about doing something that actually helps normal families?",
            "This is what's wrong with the system. Technocratic solutions that help the connected, not the community.",
        ],
        "nuanced": [
            "I get the idea, but will this actually help working families, or just create more bureaucracy?",
            "Some good points here. I just worry it'll end up benefiting the wrong people, like most {topic_adj} programs.",
            "The diagnosis is right — the prescription might not be. Let's make sure it helps the people who need it.",
            "I want to support this, but I've been burned by promises about {topic_noun} before.",
        ],
    },
    "traditionalist": {
        "supportive": [
            "This respects the values that have sustained our communities for generations.",
            "Strong communities and traditional institutions are the best answer to {topic_adj} challenges.",
            "Agree. We've moved too far too fast on {topic_noun}. Time to get back to basics.",
            "Faith, family, and community — that's how you address {topic_noun}, not with more government.",
            "Finally, some common sense. Our grandparents understood {topic_noun} better than our politicians do.",
            "I support this. Not everything needs a government program. Sometimes the old ways work best.",
        ],
        "opposing": [
            "This undermines the traditional values and institutions that hold our communities together.",
            "We're rushing to change things that have worked for generations. Where's the humility?",
            "More social engineering won't fix {topic_noun}. Stronger families and communities will.",
            "This reflects the arrogance of thinking we can plan society from the top down.",
            "The traditional approach to {topic_noun} works. The problem is we've abandoned it.",
        ],
        "nuanced": [
            "There might be room for some reform, but we shouldn't throw out tradition in the process.",
            "I'm wary of change for change's sake, but I acknowledge {topic_noun} has real problems.",
            "Any changes to {topic_noun} need to strengthen, not weaken, our community institutions.",
            "I see the need for improvement, but let's not lose what makes {location_name} special in the process.",
        ],
    },
}

# Map prefix → belief system name for comment generation
PREFIX_TO_BELIEF = {
    "prog": "progressive",
    "lib": "liberal",
    "socdem": "social_democrat",
    "soc": "socialist",
    "mod": "moderate",
    "cen": "centrist",
    "libt": "libertarian",
    "con": "conservative",
    "pop": "populist",
    "trad": "traditionalist",
}

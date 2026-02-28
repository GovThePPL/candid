"""
Post title/body templates organized by stage × post_type.

Placeholders use {topic_vocabulary} keys from session JSON files:
  {topic_noun}          - e.g. "healthcare", "public transit"
  {topic_adj}           - e.g. "healthcare-related", "transit"
  {location_name}       - e.g. "Oregon", "the Portland metro area"
  {stakeholder}         - e.g. "hospitals", "insurance companies"
  {specific_issue}      - e.g. "mental health access", "bus frequency"
  {policy_example}      - e.g. "Medicaid expansion", "rent control"
  {data_point}          - e.g. "3-month wait times", "$15/hour minimum"
"""

POST_TEMPLATES = {
    # =========================================================================
    # PROPOSAL_ISSUE — Identifying problems, sharing experiences
    # =========================================================================
    "proposal_issue": {
        "discussion": [
            {
                "title": "What {topic_noun} issues matter most to {location_name}?",
                "body": "Let's identify the most pressing {topic_adj} challenges facing "
                        "our community. What have you experienced or observed?\n\n"
                        "I'm curious whether people see this differently depending on "
                        "where they live and work.",
            },
            {
                "title": "How does {topic_noun} affect everyday life in {location_name}?",
                "body": "I've been thinking about how {topic_noun} plays out in daily "
                        "life here. The headlines tell one story, but what's the reality "
                        "on the ground?\n\nShare your experiences.",
            },
            {
                "title": "The real cost of {topic_noun} in {location_name}",
                "body": "We talk about {topic_noun} in abstract terms, but the real "
                        "costs — financial, emotional, social — often go unmentioned.\n\n"
                        "What has {topic_noun} actually cost you or your family?",
            },
            {
                "title": "{topic_noun} in {location_name}: Where do we stand?",
                "body": "Before we can move forward, we need an honest assessment of "
                        "where things stand with {topic_noun} in our area. What's working? "
                        "What's broken?\n\nLet's build a shared picture of reality.",
            },
            {
                "title": "Who is most affected by {topic_adj} issues in {location_name}?",
                "body": "When we talk about {topic_noun}, it's easy to stay in the abstract. "
                        "But some communities are hit harder than others.\n\nWho's bearing "
                        "the brunt of {topic_adj} challenges here?",
            },
            {
                "title": "Unpopular opinions about {topic_noun}",
                "body": "I'll go first: I think the mainstream conversation about {topic_noun} "
                        "misses some important nuances. There are perspectives that don't "
                        "get heard because they don't fit neatly into left or right.\n\n"
                        "What's your unpopular take on {topic_noun}?",
            },
            {
                "title": "Local perspective: {topic_noun} in {location_name}",
                "body": "National debates about {topic_noun} often miss what matters at "
                        "the local level. Here in {location_name}, the reality is more "
                        "complex than cable news suggests.\n\nWhat does {topic_noun} "
                        "look like in your neighborhood?",
            },
            {
                "title": "Personal stories: How {topic_noun} has touched your life",
                "body": "Policy debates feel abstract until they're not. I'd like to hear "
                        "personal stories about how {topic_noun} has affected people in "
                        "{location_name}.\n\nNumbers matter, but stories help us understand "
                        "the human impact.",
            },
            {
                "title": "What do people get wrong about {topic_noun}?",
                "body": "There's a lot of misinformation and oversimplification around "
                        "{topic_noun}. What are the most common misconceptions you encounter?\n\n"
                        "I'll start: many people assume {topic_noun} is a simple issue with "
                        "an obvious solution, but the reality is much more complex.",
            },
            {
                "title": "Is {topic_noun} getting better or worse in {location_name}?",
                "body": "I've lived in {location_name} for a while now and I'm genuinely "
                        "unsure whether {topic_noun} is improving or declining. The data "
                        "seems mixed.\n\nWhat's your sense of the trajectory?",
            },
        ],
        "question": [
            {
                "title": "Can someone explain how {topic_noun} works in {location_name}?",
                "body": "I'm relatively new to this topic and trying to understand the "
                        "basics. How does {topic_noun} actually work here? What are the "
                        "key policies and institutions involved?",
            },
            {
                "title": "What resources exist for {topic_noun} in {location_name}?",
                "body": "I'm looking for good resources — organizations, data sources, "
                        "or local experts — to better understand {topic_adj} issues in "
                        "our area. Any recommendations?",
            },
            {
                "title": "How does {location_name} compare to other areas on {topic_noun}?",
                "body": "Are we ahead or behind other states/cities when it comes to "
                        "{topic_noun}? I'd love to see some comparisons or hear from "
                        "people who've lived elsewhere.",
            },
            {
                "title": "What's the history of {topic_noun} policy in {location_name}?",
                "body": "To understand where we're going, we need to understand where "
                        "we've been. Can someone give a brief history of {topic_adj} "
                        "policy in {location_name}?",
            },
        ],
        "proposal": [
            {
                "title": "Early idea: A new approach to {topic_noun}",
                "body": "I know we're still in the issue-identification phase, but I want "
                        "to float an early idea: what if we approached {topic_noun} by "
                        "focusing on {specific_issue} first?\n\nThis is rough — I'm looking "
                        "for feedback, not commitment.",
            },
            {
                "title": "Should {location_name} rethink its approach to {topic_noun}?",
                "body": "Our current approach to {topic_noun} isn't working for everyone. "
                        "I propose we start by identifying what a better system would look "
                        "like before arguing about specific policies.\n\nWhat principles "
                        "should guide us?",
            },
        ],
    },

    # =========================================================================
    # PROPOSAL_QUALIFY — Refining issues, testing feasibility
    # =========================================================================
    "proposal_qualify": {
        "discussion": [
            {
                "title": "Refining our approach to {topic_noun}: What's actually feasible?",
                "body": "We've identified the key issues around {topic_noun}. Now let's "
                        "get practical — what approaches are actually feasible given "
                        "{location_name}'s current resources and political landscape?",
            },
            {
                "title": "Trade-offs in {topic_adj} policy: What are we willing to accept?",
                "body": "Every policy involves trade-offs. With {topic_noun}, what are we "
                        "willing to accept? Higher costs? Slower implementation? Imperfect "
                        "coverage?\n\nLet's be honest about the compromises needed.",
            },
            {
                "title": "Learning from other places: {topic_adj} solutions that worked",
                "body": "Other states and countries have tried various approaches to "
                        "{topic_noun}. What can {location_name} learn from their successes "
                        "and failures?\n\nI've been looking at some examples and want to "
                        "share what I've found.",
            },
            {
                "title": "What would success look like for {topic_noun} in {location_name}?",
                "body": "Before debating solutions, can we agree on what success looks "
                        "like? What metrics or outcomes would tell us we're making "
                        "progress on {topic_noun}?",
            },
            {
                "title": "The funding question: How do we pay for {topic_adj} improvements?",
                "body": "Good ideas are worthless without funding. Let's talk about the "
                        "financial side of {topic_adj} reform. Where does the money come "
                        "from, and who bears the cost?",
            },
        ],
        "question": [
            {
                "title": "What are the main objections to {topic_adj} reform?",
                "body": "I want to steelman the other side. What are the strongest "
                        "arguments against the {topic_adj} reforms being discussed? "
                        "Understanding objections helps us build better proposals.",
            },
            {
                "title": "Has anyone looked at the data on {topic_noun} outcomes?",
                "body": "I keep seeing claims from both sides about {topic_noun} but "
                        "I'm struggling to find solid data. Has anyone dug into the "
                        "actual research on what works?",
            },
            {
                "title": "Legal constraints on {topic_adj} policy in {location_name}?",
                "body": "Before we get too deep into proposals, what are the legal "
                        "constraints? Are there state/federal laws that limit what "
                        "{location_name} can do on {topic_noun}?",
            },
        ],
        "proposal": [
            {
                "title": "Proposal: Pilot program for {topic_noun} in {location_name}",
                "body": "Based on our discussion, I propose a pilot program to test "
                        "a new approach to {topic_noun}. Start small, measure results, "
                        "and scale what works.\n\nHere's a rough outline of what that "
                        "could look like...",
            },
            {
                "title": "Revised proposal: Addressing {specific_issue} through {policy_example}",
                "body": "After hearing everyone's feedback, I've revised my earlier "
                        "proposal. The key changes address concerns about feasibility "
                        "and funding.\n\nCore idea: tackle {specific_issue} through "
                        "{policy_example}, with built-in evaluation milestones.",
            },
            {
                "title": "Competing approaches to {topic_noun}: A comparison",
                "body": "I've tried to map out the main competing approaches to {topic_noun} "
                        "that have emerged in our discussion. Each has strengths and "
                        "weaknesses.\n\nLet's evaluate them honestly.",
            },
        ],
    },

    # =========================================================================
    # PROPOSAL_STAKEHOLDERS — Identifying who matters
    # =========================================================================
    "proposal_stakeholders": {
        "discussion": [
            {
                "title": "Who needs to be at the table for {topic_adj} reform?",
                "body": "If we're going to make progress on {topic_noun} in {location_name}, "
                        "who are the key stakeholders? Let's identify who should have a "
                        "voice in this process.",
            },
            {
                "title": "The voices we're missing in the {topic_noun} conversation",
                "body": "Our discussion about {topic_noun} has been valuable, but I notice "
                        "some perspectives are underrepresented. Who's not at the table "
                        "but should be?",
            },
            {
                "title": "How do {stakeholder} view {topic_adj} reform?",
                "body": "We've been discussing {topic_noun} mostly from a community "
                        "perspective. But {stakeholder} are major players in this space. "
                        "How do they see the issue, and what would they support?",
            },
            {
                "title": "Building coalitions for {topic_adj} action in {location_name}",
                "body": "Real change on {topic_noun} requires broad coalitions. Who are "
                        "the natural allies? Where are the unexpected areas of agreement?\n\n"
                        "Let's map out potential partnerships.",
            },
            {
                "title": "Opposition to {topic_adj} reform: Understanding the other side",
                "body": "Not everyone supports the direction of our {topic_adj} proposals. "
                        "Let's honestly engage with the opposition. What are their legitimate "
                        "concerns? Can we address them?",
            },
        ],
        "question": [
            {
                "title": "How have {stakeholder} responded to similar proposals elsewhere?",
                "body": "Before we finalize our approach, I'd like to understand how "
                        "{stakeholder} have reacted to similar {topic_adj} proposals in "
                        "other areas. Any examples?",
            },
            {
                "title": "What role should government play in {topic_noun}?",
                "body": "This seems like a fundamental question we haven't fully addressed: "
                        "what's the proper role of government in {topic_noun}? Should it "
                        "regulate, provide, incentivize, or stay out of the way?",
            },
        ],
        "proposal": [
            {
                "title": "Proposal: Stakeholder advisory committee for {topic_noun}",
                "body": "I propose creating a formal stakeholder advisory committee that "
                        "includes {stakeholder}, community members, and technical experts. "
                        "This ensures all voices are heard as we develop {topic_adj} policy.",
            },
        ],
    },

    # =========================================================================
    # OPINION_DISCUSSION — Debating proposals, sharing opinions
    # =========================================================================
    "opinion_discussion": {
        "discussion": [
            {
                "title": "The case for bold action on {topic_noun}",
                "body": "Incrementalism isn't working for {topic_noun} in {location_name}. "
                        "We've been nibbling around the edges for years. It's time for "
                        "something bolder.\n\nHere's why I think we need to think bigger...",
            },
            {
                "title": "The case for caution on {topic_adj} reform",
                "body": "I know there's enthusiasm for dramatic {topic_adj} reform, but "
                        "I want to make the case for caution. Well-intentioned policies "
                        "can have unintended consequences.\n\nLet's be careful here.",
            },
            {
                "title": "Finding common ground on {topic_noun}",
                "body": "This discussion has surfaced real disagreements about {topic_noun}. "
                        "But I also see areas of overlap. Can we identify the common ground "
                        "and build from there?",
            },
            {
                "title": "{topic_noun} and equity: Who benefits, who pays?",
                "body": "Every {topic_adj} proposal has distributional consequences. Who "
                        "benefits from the proposals we're discussing, and who bears the "
                        "costs? Let's be explicit about this.",
            },
            {
                "title": "What's working with {topic_noun} that we should keep?",
                "body": "In our rush to fix what's broken with {topic_noun}, let's not "
                        "throw out what's working. What aspects of our current approach "
                        "to {topic_noun} should we preserve?",
            },
            {
                "title": "Responding to the latest {topic_adj} developments in {location_name}",
                "body": "Recent developments around {topic_noun} in {location_name} have "
                        "changed the landscape. How does this affect the proposals we've "
                        "been discussing?",
            },
            {
                "title": "Values and {topic_noun}: What principles should guide us?",
                "body": "Behind every policy disagreement about {topic_noun} is a deeper "
                        "values disagreement. Let's surface those values and see if we "
                        "can find shared principles.",
            },
        ],
        "question": [
            {
                "title": "What would you ask an expert about {topic_noun}?",
                "body": "If you could sit down with a {topic_adj} expert, what would you "
                        "ask them? I'm compiling questions for a community Q&A we're "
                        "trying to organize.",
            },
            {
                "title": "How has {topic_noun} affected your family?",
                "body": "I'm looking for personal perspectives on how {topic_noun} has "
                        "impacted real families in {location_name}. Sometimes the personal "
                        "stories cut through the political noise.",
            },
            {
                "title": "What do {location_name} voters actually want on {topic_noun}?",
                "body": "There's a gap between what politicians say and what voters actually "
                        "want on {topic_noun}. What does the polling show? What's your "
                        "sense from talking to neighbors?",
            },
        ],
        "proposal": [
            {
                "title": "Proposal: Community-led {topic_adj} initiative",
                "body": "I propose a community-led initiative to address {specific_issue}. "
                        "Rather than waiting for top-down solutions, we can start making "
                        "progress at the neighborhood level.\n\nHere's what I have in mind...",
            },
            {
                "title": "A moderate path forward on {topic_noun}",
                "body": "The extremes of this debate aren't getting us anywhere. I propose "
                        "a moderate approach to {topic_noun} that takes the best ideas "
                        "from both sides.\n\nThe core compromise is...",
            },
        ],
    },

    # =========================================================================
    # REFLECTION_CURATION — Curating best ideas, distilling opinions
    # =========================================================================
    "reflection_curation": {
        "discussion": [
            {
                "title": "Ranking our {topic_adj} priorities: What comes first?",
                "body": "We've identified many {topic_adj} issues. But we can't do "
                        "everything at once. What should be the top 3 priorities for "
                        "{location_name}?",
            },
            {
                "title": "Distilling the key arguments on {topic_noun}",
                "body": "After weeks of discussion, I've tried to distill the main "
                        "arguments we've heard about {topic_noun} into a few core positions. "
                        "Does this capture the debate fairly?",
            },
            {
                "title": "Points of agreement on {topic_noun}: A summary",
                "body": "Despite our disagreements, there are things most of us agree on "
                        "about {topic_noun}. Let me try to summarize those points of "
                        "agreement. Correct me where I'm wrong.",
            },
            {
                "title": "The strongest arguments on each side of {topic_noun}",
                "body": "In the spirit of fair debate, here are what I think are the "
                        "strongest arguments on each side of the {topic_noun} discussion. "
                        "Did I represent your position accurately?",
            },
            {
                "title": "What have we learned from this {topic_noun} discussion?",
                "body": "We've been discussing {topic_noun} for a while now. What have "
                        "you learned? Has anyone changed their mind on anything? What "
                        "surprised you?",
            },
        ],
        "question": [
            {
                "title": "Which {topic_adj} proposal has the most support?",
                "body": "I'm trying to gauge where the community stands on the various "
                        "{topic_adj} proposals we've discussed. Which one do you think "
                        "has the broadest support?",
            },
        ],
        "proposal": [
            {
                "title": "Consolidated proposal: {topic_adj} action plan for {location_name}",
                "body": "Drawing from our discussions, here's a consolidated proposal that "
                        "tries to incorporate the best ideas from across the political "
                        "spectrum.\n\nCore elements:\n- Address {specific_issue}\n"
                        "- Balance cost with effectiveness\n- Include accountability measures",
            },
            {
                "title": "Proposal: Phased approach to {topic_noun} reform",
                "body": "Given the complexity and disagreements around {topic_noun}, I propose "
                        "a phased approach. Phase 1 tackles the areas of agreement. "
                        "Phase 2 addresses the harder questions.\n\nThis way we make "
                        "progress even while debating the controversial stuff.",
            },
        ],
    },

    # =========================================================================
    # REFLECTION_PROPOSALS — Formal proposals for action
    # =========================================================================
    "reflection_proposals": {
        "discussion": [
            {
                "title": "Evaluating the {topic_adj} proposals: Pros and cons",
                "body": "We have several formal proposals on the table for {topic_noun}. "
                        "Let's evaluate them honestly — what are the realistic pros and "
                        "cons of each approach?",
            },
            {
                "title": "Implementation challenges for {topic_adj} proposals",
                "body": "Good ideas are only as good as their implementation. What are "
                        "the practical challenges we'll face implementing {topic_adj} "
                        "reform in {location_name}?",
            },
            {
                "title": "Cost-benefit analysis of {topic_adj} proposals",
                "body": "Let's get specific about costs and benefits. For each major "
                        "{topic_adj} proposal, what's the estimated cost and expected "
                        "benefit? Who has numbers?",
            },
            {
                "title": "Timeline for {topic_adj} action: How fast can we move?",
                "body": "How quickly can {location_name} realistically implement {topic_adj} "
                        "reforms? What needs to happen first, and what's the realistic "
                        "timeline?",
            },
        ],
        "question": [
            {
                "title": "Which {topic_adj} proposal would you vote for?",
                "body": "If you had to pick one {topic_adj} proposal to support today, "
                        "which would it be and why? I'm genuinely curious where people "
                        "in {location_name} land on this.",
            },
        ],
        "proposal": [
            {
                "title": "Final proposal: {topic_adj} reform package for {location_name}",
                "body": "After extensive community input, here's a comprehensive {topic_adj} "
                        "reform proposal for {location_name}. It balances competing "
                        "interests and includes clear accountability metrics.\n\n"
                        "I believe this represents a realistic path forward.",
            },
            {
                "title": "Alternative proposal: Market-based approach to {topic_noun}",
                "body": "While I respect the community proposals on {topic_noun}, I want "
                        "to offer an alternative: a market-based approach that leverages "
                        "incentives rather than mandates.\n\nHere's how it would work...",
            },
            {
                "title": "Proposal: Public-private partnership for {topic_noun}",
                "body": "Neither pure government nor pure market solutions will solve "
                        "{topic_noun} alone. I propose a public-private partnership "
                        "model that combines the best of both.\n\nThe partnership "
                        "structure would be...",
            },
        ],
    },

    # =========================================================================
    # CONSENSUS — Reflection, final agreement, and next steps
    # =========================================================================
    "consensus": {
        "discussion": [
            {
                "title": "Reflecting on our {topic_noun} discussion: What worked?",
                "body": "As we near the end of this deliberation on {topic_noun}, let's "
                        "reflect on the process. What worked well? What could be improved "
                        "for next time?",
            },
            {
                "title": "How has this discussion changed your view on {topic_noun}?",
                "body": "When we started this conversation about {topic_noun}, I had a "
                        "pretty firm position. The discussion has actually shifted my "
                        "thinking in some ways.\n\nHas anyone else's perspective changed?",
            },
            {
                "title": "Key takeaways from the {topic_noun} deliberation",
                "body": "Here are my key takeaways from our {topic_noun} deliberation:\n\n"
                        "1. The issue is more complex than most people realize\n"
                        "2. There's more common ground than expected\n"
                        "3. Implementation details matter as much as principles\n\n"
                        "What are yours?",
            },
            {
                "title": "What {location_name} can learn from this {topic_adj} conversation",
                "body": "This deliberation about {topic_noun} has produced real insights. "
                        "What concrete lessons should {location_name} take away from "
                        "this process?",
            },
            {
                "title": "Building consensus on {topic_noun}: Where do we agree?",
                "body": "After all our discussion about {topic_noun}, it's time to identify "
                        "areas of genuine consensus. What can we agree on, even if we "
                        "disagree on other things?",
            },
            {
                "title": "The {topic_noun} consensus document: Does this represent us?",
                "body": "Here's my attempt at a consensus summary of our {topic_noun} "
                        "deliberation. It represents what I believe most participants "
                        "can agree on.\n\nDoes this feel accurate? What's missing?",
            },
            {
                "title": "Remaining disagreements on {topic_noun}: That's OK",
                "body": "We've reached consensus on many aspects of {topic_noun}, but "
                        "some disagreements remain. That's healthy. Let's acknowledge "
                        "those honestly rather than paper over them.",
            },
        ],
        "question": [
            {
                "title": "Did this discussion change anyone's mind?",
                "body": "Honest question: did participating in this {topic_noun} discussion "
                        "actually change anyone's position on anything? I'm curious about "
                        "the value of deliberation.",
            },
            {
                "title": "Can you live with the {topic_noun} consensus?",
                "body": "Consensus doesn't mean everyone's first choice won. Can you "
                        "accept the emerging consensus on {topic_noun}, even if it's "
                        "not exactly what you wanted?",
            },
        ],
        "proposal": [
            {
                "title": "Next steps: How to keep {topic_adj} momentum going",
                "body": "This discussion shouldn't end here. I propose concrete next "
                        "steps to keep the momentum going on {topic_noun} in "
                        "{location_name}:\n\n1. Form a working group\n2. Schedule "
                        "follow-up in 3 months\n3. Engage local officials",
            },
            {
                "title": "Final consensus: {topic_adj} principles for {location_name}",
                "body": "After extensive deliberation, here are the consensus principles "
                        "our community has developed for {topic_noun} in {location_name}. "
                        "These represent shared values, not partisan positions.",
            },
        ],
    },
}

# Technology Choices

*Subject to Change*

* Backend: node.js docker containers (scalability)
* Frontend: reactnative (allows cross platform app development), Expo
* Database: postgres
* CICD: github actions
* Cloud provider: AWS
* Comment detoxification: perspectiveapi
* Group analysis: pol.is
* idp: cognito?

# Feature Specifications

## Log in:
- When a user first opens the application, they are given the ability to log in.
- They may log in with Google’s IDP or Facebook’s IDP
- They may log in with an Email and Password
- There is a button to create an account with a username and password.
- Their login information is stored securely in the postgres database.
- They may continue without logging in as a “Guest”
- If they create an account or continue as a “Guest”, they must pass a Captcha

## Create an Account:
- When a user creates an account via Google IDP, Facebook IDP, or email, they are presented with a form to “Create an Account”
- The “Create an Account Form” includes the following fields:
   - Username
   - Display Name
   - password
   - Password re-entry

## Users:
- There are four types of users:
   - “Normal Users” - these users just interact with the application.  They are allowed to:
      - post position statements
      - swipe on position statements
      - initiate and respond to chat
      - view their position statements
      - report position statements from other users
      - report chat logs that they have participated in
      - View “Saved Chat Logs”
      - View “Recent Chat Logs”
      - View their “Position Statements” and the number of “Agrees”, “Disagrees”, and “Chat Requests” that each has garnered
   - “Moderators” - these users have all the permissions of “Normal Users”, but they are additionally able to:
      - view the “moderation queue”
      - respond to items in the “moderation queue”
      - answer moderation appeals from users
   - “Admins” - these users have all the permissions of “Normal Users” and “Moderators” but they also have the ability to:
      - view all the responses from moderators in the “moderation queue”
      - override moderator decisions in the “Moderation queue”
      - post surveys
   - “Guests”.  Guests can only:
      - Swipe on position statements
      - Answer survey questions
      - Guests are identified with a cookie
      - If a guest creates an account, they’re given the opportunity to retain their position statements collated via the cookie
      - Guest statements are stored locally and pushed upon account creation
   - User’s information is stored and retrieved from the “Database”

## Position Statement:
- users can post a "Position Statement"
- users can view a card in the “User Card Queue” that displays a single "Position Statement" posted by another user
- A "Position Statement" card displays the username of the user who posted it in small text at the bottom, with the “Position Statement” in text that fills a substantial portion of the card
- when a user is viewing a "Position Statement" from another user, they can interact with it in the following ways:
    - Swiping left will register a "disagree" to the "Position Statement"
    - Swiping right will register an "agree" to the "Position Statement"
    - Swiping down will register a "Pass" to the position statement
    - Swiping up will initiate a one-on-one chat request with the user that posted the statement
- users can report a "Position Statement"
- Users can view their current position statements and see how many Agrees and Disagrees the position has garnered
- Users can only have up to 3 “Position Statements” active at a time. Other position statements are not visible to users in the “User Card Queue”.
- “Position Statements” have a “Position Category”
- “Position Categories” have their own “Conversation” in polis
- Users can choose to prioritize or hide “Positions” based on “Position Category”
- When a position statement gets a vote, it is added to polis
- Whenever a position statement is voted on, the vote is recorded in polis.

## Chat:
- Chat Request
    - Users will receive a notification when they've received a "Chat Request"
    - Users can respond to the "Chat Request" with "Accept" or "Dismiss"
    - If a user replies "Accept" to a "Chat Request", the user is placed in a one-on-one chat with the user that sent the "Chat Request"
    - When a “Chat Request” is pending, a countdown timer displaying the “Chat Request Timeout” is displayed
    - When the “Chat Request Timeout” reaches zero, the chat request is automatically “Dismissed” and the “Chat Request” is retracted
    - When either participant “Dismisses” the “Chat Request”, the “Request” is “Dismissed” for both users
- Users can send a message to the other participant
- When a user attempts to send a message, its toxicity will be evaluated by “PerspectiveAPI”.  If it is found to be toxic, the user has two options:
    - Cancel and rewrite the comment
    - Wait for a timeout to count down, then post it anyway
- Messages sent by the other participant will be received by the User
- User can send special "Agreed Upon Position" messages
- "Agreed Upon Position" messages can be interacted with in one of three ways:
    - Accept. An accepted "Agreed Upon Position" message is hilighted and appears to be sent by both users
    - Reject. A rejected "Agreed Upon Position" message appears only to be sent by the person who proposed it
    - Respond. When a user Responds to an "Agreed Upon Position" message, they can edit the text and submit it. When it is submitted, the other user can Accept, Reject, or Respond to it
- "Agreed Upon Positions" are listed in a menu that comes in from the right side of the screen when a button is clicked.
- "Agreed Upon Positions" can be referenced later in the chat by clicking on them in the drawer. The agreed upon statement is included within the user’s chat message.
- Chat can be ended in one of two ways:
    - The user can exit chat at any time. After they have exited chat, they have the option to report the chat.
    - The user can send an "Agreed Upon Closure" statement. This "Agreed Upon Closure" message functions as an "Agreed Upon Statement" message but once it is accepted by both parties ends the chat. The user has the ability to save a chat after it has been ended with an "Agreed Upon Closure" statement.
- After chat has concluded, the user will have the ability to:
    - Mark the position being discussed “Agree”, “Disagree”, “Pass” if they initiated chat
    - Report the chat
    - Send a “Kudos” to the other user

## Moderation Queue:
- “Position Statements” and “Chat logs” that are reported are sent to the “Moderation Queue” as “Moderation Requests”
- When a user reports a “Chat Log” or “Position Statement”, they are prompted to select a “Rule” which the “Chat Log” or “Position Statement” has broken
- The user is presented with this list of “rules”, of which they can select one or more and also a text box (Limited to 255 characters) in which they can write a “message” to the moderators to be sent along with the “Moderation Request”.  A submit button sends the report to the backend.
- “Rules” is a list of the following:
    - “This content calls for violence against people based on immutable/quasi-immutable characteristics/strong convictions”
    - “This content is sexual/obscene”
    - “This content contains spam or self-promotion.”
    - “This content does not make a normative political statement”
- The “Moderation Queue” is display similar to the “Position Statements”
- “Moderators” and “Administrators” can view the moderation queue
- The “Moderation Queue” presents statements one at a time and presents the ability of moderators to take the following actions:
    - “Pass” - The report remains unaddressed and may appear again in the Queue
    - “Dismiss” - The report is dismissed and no action is taken.  The moderator may write a reason why the report was dismissed
    - “Take Action”:
        - Different action may be taken for different user “Classes”
            - “Submitter” (submitted the inappropriate content)
            - “Active Adopter” (Saw someone else was using the inappropriate content and adopted the position statement.  The statement is currently active on their profile)
            - “Passive Adopter” (the statement exists in the user’s positions, but is not active)
        - Actions:
            - “Permanent Ban”: the user is not able to participate again, except to appeal their ban
            - “Temporary Ban”: the user is banned for a specified length of time
            - “Warning”: a warning is issued informing the user they should not behave in this way again
            - “Removed”: The offensive content is removed without a warning
        - In all cases the action may be accompanied by a justification from the moderator
    - “Mark report spurious”: This report is likely filed incorrectly or with malintent

## Polis Interaction:
- Users can view their position in polis for each “Position Category” and “Overall”
- Users can view position responses and interact with polis

## Survey cards:
- “Survey Cards” are similar to “Position Statements”, in that they are displayed in the “User Card Queue”
- “Survey Cards” do not use swiping.  They have a “Title” and a “Body”.  The “Title” describes the survey question and the “Body” contains a list of responses to the survey
- “Admins” can create new “Surveys”.
- A “Survey” is a list of “Survey Questions”
- A “Survey” can be directed at a particular “Position Category” or at the general population
- A “Survey” directed at a particular “Position Category” is displayed alongside metrics for that particular “Position Category”.

# Database specification

*This is provisional and subject to change*

- user
    - id (key)
    - username
    - email
    - password_hash
    - created_time
    - display_name
    - user_type
- user_activity
    - id (key)
    - user_id (foreign_key)
    - activity_start_time
    - activity_end_time
- user_position_categories
    - id (key)
    - user_id (foreign_key)
    - position_category (foreign_key)
    - priority
- kudos
    - id (key)
    - sender_user_id (foreign_key)
    - receiver_user_id (foreign_key)
    - chat_log_id (foreign_key)
- position
    - id (key)
    - creator_user_id (foreign_key)
    - category_id (foreign_key)
    - location_id (foreign_key)
    - statement
    - created_time
    - agree_count
    - disagree_count
    - pass_count
    - chat_count
    - status
- position_category
    - id (key)
    - Label
    - parent_position_category_id (foreign_key)
- location
    - id (key)
    - parent_location_id (foreign_key)
    - code
    - name
- affiliation
    - id (key)
    - location_id (foreign_key)
    - name
- user_position
    - id (key)
    - user_id (foreign_key)
    - position_id (foreign_key)
    - status
    - agree_count
    - disagree_count
    - pass_count
    - chat_count
- response
    - id (key)
    - position_id (foreign_key)
    - user_id (foreign_key)
    - response
- survey
    - id (key)
    - creator_user_id (foreign key)
    - position_category_id (foreign_key)
    - survey_title
    - created_time
    - start_time
    - end_time
- survey_question
    - id (key)
    - survey_id (foreign_key)
    - survey_question
- survey_question_option
    - id (key)
    - survey_question_id (foreign_key)
    - survey_question_option
- survey_question_response
    - id (key)
    - survey_question_option_id (foreign_key)
    - user_id (foreign_key)
    - response_time
- chat_request
    - id (key)
    - initiator_user_id (foreign_key)
    - user_position_id (foreign_key)
    - response
    - response_time
- chat_log
    - id (key)
    - chat_request_id (foreign_key)
    - start_time
    - end_time
    - end_type
- report
    - id (key)
    - target_object_type
    - target_object_id (foreign_key)
    - submitter_user_id (foreign_key)
    - rule_id (foreign_key)
    - status
    - submitter_comment
- mod_action
    - id (key)
    - report_id (foreign_key)
    - responder_user_id (foreign_key)
    - mod_response
    - mod_response_text
- mod_action_class
    - id (key)
    - mod_action_id (foreign_key)
    - class
    - action_start_time
    - action_end_time
    - action
- mod_action_target
    - id (key)
    - user_id (foreign_key)
    - mod_action_class_id (foreign_key)
- mod_action_appeal
    - id (key)
    - user_id (foreign_key)
    - mod_action_id (foreign_key)
    - appeal_text
    - appeal_state
- mod_action_appeal_response
    - id (key)
    - mod_action_appeal_id (foreign_key)
    - responder_user_id (foreign_key)
    - appeal_response_text
- user_demographics
    - id (key)
    - user_id (foreign key)
    - location_id (foreign_key)
    - affiliation_id (foreign_key)
    - lean
    - education
    - geo_locale
    - race
    - sex
- user_location
    - id (key)
    - user_id (foreign_key)
    - location_id (foreign_key)
- rule
    - id (key)
    - creator_user_id (foreign_key)
    - title
    - text
    - status

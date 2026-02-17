# Components

Reusable React Native components used across the app.

## Structure

```
components/
├── auth/                         # Auth route guards
│   ├── GuestOnly.jsx             # Redirects authenticated users away from auth screens
│   └── UserOnly.jsx              # Redirects unauthenticated users to login
├── cards/                        # Card queue card types (see cards/index.js for registry)
│   ├── AdminResponseCard.jsx     # Admin response to user requests
│   ├── BanNotificationCard.jsx   # Ban notification display
│   ├── ChatRequestCard.jsx       # Incoming chat request card
│   ├── DemographicCard.jsx       # Demographic survey card
│   ├── DiagnosticsConsentCard.jsx # Diagnostics consent prompt
│   ├── KudosCard.jsx             # Kudos/recognition card
│   ├── PairwiseCard.jsx          # Pairwise comparison survey card
│   ├── PositionCard.jsx          # Position statement card (agree/disagree/pass)
│   ├── PositionRemovedCard.jsx   # Notification that a position was removed
│   ├── SurveyCard.jsx            # Multiple-choice survey card
│   ├── SwipeableCard.jsx         # Swipeable card wrapper with gesture handling
│   └── index.js                  # Card type registry and factory
├── discuss/                      # Discussion forum components
│   ├── BridgingBadge.jsx         # Bridging score badge
│   ├── CommentItem.jsx           # Threaded comment with voting
│   ├── CommentSortControl.jsx    # Comment sort order picker
│   ├── DownvoteReasonPicker.jsx  # Reason selector for downvotes
│   ├── FeedTabBar.jsx            # Post feed tab switcher
│   ├── MarkdownRenderer.jsx      # Markdown-to-native renderer
│   ├── PostCard.jsx              # Discussion post card
│   ├── PostHeader.jsx            # Post header with author info
│   ├── ReplyComposer.jsx         # Full-screen reply modal with preview and link insertion
│   ├── RoleBadge.jsx             # User role indicator badge
│   ├── SortDropdown.jsx          # Sort option dropdown
│   └── VoteControl.jsx           # Upvote/downvote control
├── stats/                        # Statistics and analytics components
│   ├── AgreedStatementsModal.jsx # Modal showing agreed statements
│   ├── ClosureCard.jsx           # Position closure summary card
│   ├── GroupDemographicsModal.jsx # Group demographics breakdown modal
│   ├── GroupTabBar.jsx           # Opinion group tab switcher
│   ├── OpinionMapModal.jsx       # Opinion map modal wrapper
│   ├── OpinionMapVisualization.jsx # 2D opinion cluster visualization
│   ├── PositionCard.jsx          # Position card for stats view
│   ├── PositionCarousel.jsx      # Horizontal position carousel
│   ├── PositionSummaryCard.jsx   # Summarized position stats
│   ├── SurveyResultsModal.jsx    # Survey results display modal
│   └── VoteDistributionBar.jsx   # Vote distribution bar chart
├── AdoptPositionExplanationModal.jsx # Explanation modal for adopting positions
├── Avatar.jsx                    # User avatar with optional trust badge
├── BottomDrawerModal.jsx         # Bottom sheet modal
├── BugReportModal.jsx            # Bug report submission modal
├── CardShell.jsx                 # Generic card container with themed styling
├── ChatHistoryContent.jsx        # Chat history list with position context; accepts showHeader prop
├── ChatRequestIndicator.jsx      # Pending chat request badge/indicator
├── ChattingListExplanationModal.jsx # Explanation modal for chatting list
├── CommentsContent.jsx           # User's comment history list with vote counts and post context
├── EmptyState.jsx                # Empty state placeholder with icon and message
├── Header.jsx                    # Top navigation header bar
├── IconTabBar.jsx                # Reusable icon tab bar with active indicator
├── ImageCropModal.jsx            # Image cropping modal for avatars
├── InfoModal.jsx                 # Informational modal dialog
├── KudosMedallion.jsx            # Kudos score medallion display
├── LanguagePicker.jsx            # Language selection control (en/es)
├── LoadingView.jsx               # Full-screen loading spinner
├── LocationCategoryBadge.jsx     # Location/category badge pill
├── LocationCategorySelector.jsx  # Location and category multi-selector
├── LocationFilterButton.jsx      # Location filter toggle button
├── LocationPicker.jsx            # Location hierarchy picker
├── ModerationActionModal.jsx     # Moderation action confirmation modal
├── ModerationHistoryModal.jsx    # Moderation history viewer modal
├── PositionInfoCard.jsx          # Detailed position information card
├── PositionListManager.jsx       # Position list with search, chat/delete/add modes
├── PositionManagerContent.jsx    # Position management view with create form and list
├── PostsContent.jsx              # User's post history list with vote counts and comment counts
├── ReportModal.jsx               # Content reporting modal
├── Skeleton.jsx                  # Skeleton loading primitives (SkeletonPulse, SkeletonBox, SkeletonCircle, SkeletonLine)
├── Spacer.jsx                    # Configurable spacing component
├── StickyHeaderFlatList.jsx      # FlatList wrapper with scrollable header and sticky header support
├── ThemedButton.jsx              # Theme-aware button
├── ThemedCard.jsx                # Theme-aware card container
├── ThemedLoader.jsx              # Theme-aware loading indicator
├── ThemedLogo.jsx                # App logo with theme support
├── ThemedText.jsx                # Theme-aware text with typography presets
├── ThemedTextInput.jsx           # Theme-aware text input
├── ThemedView.jsx                # Theme-aware view container
├── Toast.jsx                     # Toast notification system (provider + useToast hook)
└── UserCard.jsx                  # User info card with avatar, name, role badge
```

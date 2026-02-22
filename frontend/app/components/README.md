# Components

Reusable React Native components used across the app.

## Structure

```
components/
├── auth/                         # Auth route guards
│   ├── GuestOnly.jsx             # Redirects authenticated users away from auth screens
│   └── UserOnly.jsx              # Redirects unauthenticated users to login
├── chat/                         # Chat screen sub-components
│   ├── ChatMessageContent.jsx    # Renders message content with quote references
│   ├── ChatSidebar.jsx           # Agreed statements and definitions sidebar panel
│   ├── QuotedBlock.jsx           # Styled block for quoted message excerpts
│   ├── ReactionBar.jsx           # Emoji reaction picker row (6 curated reactions)
│   ├── ReactionBadges.jsx        # Persistent reaction count badges below messages
│   └── TextSelectionModal.jsx    # Text selection modal for partial quoting
├── cards/                        # Card queue card types (see cards/index.js for registry)
│   ├── AdminResponseCard.jsx     # Admin response to user requests
│   ├── BanNotificationCard.jsx   # Ban notification display
│   ├── BridgingKudosCard.jsx     # Bridging kudos reward card (cross-group content)
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
│   ├── EditCommentModal.jsx      # Modal for editing an existing comment's body
│   ├── EditPostModal.jsx         # Modal for editing an existing post's title and body
│   ├── FeedTabBar.jsx            # Post feed tab switcher
│   ├── MarkdownRenderer.jsx      # Markdown-to-native renderer (variant: post/comment/wiki)
│   ├── PostCard.jsx              # Discussion post card
│   ├── PostHeader.jsx            # Post header with author info
│   ├── ReplyComposer.jsx         # WYSIWYG reply composer with modal and inline modes
│   ├── RoleBadge.jsx             # User role indicator badge
│   ├── SortDropdown.jsx          # Sort option dropdown
│   └── VoteControl.jsx           # Upvote/downvote control
├── wiki/                         # Wiki and glossary sub-components
│   ├── ContentPreviewModal.jsx   # Full-screen rendered markdown preview with Original/Changes/Diff tabs
│   ├── DiffView.jsx              # Line-by-line diff view (added/removed/same lines, themed)
│   ├── ReviewChanges.jsx          # Comprehensive field-by-field diff viewer for edit review (uses ReviewDiffContent)
│   ├── ReviewDiffContent.jsx     # Standalone diff computation and rendering (title, aliases, content, scopes, images)
│   ├── SuggestionCard.jsx        # Suggestion list item card with status badge
│   ├── SuggestionDetail.jsx      # Suggestion detail view with review actions
│   ├── VersionCard.jsx           # Version history list item card with editor name and timestamp
│   ├── SuggestionForm.jsx        # Form for creating/editing wiki suggestions (WYSIWYG + full-screen editor)
│   └── WikiPageCard.jsx          # Wiki page list item card
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
├── ChatMarkdown.jsx              # Markdown renderer for chat bubbles (white text on colored backgrounds)
├── ChatRequestIndicator.jsx      # Pending chat request badge/indicator
├── ChattingListExplanationModal.jsx # Explanation modal for chatting list
├── CommentsContent.jsx           # User's comment history list with vote counts and post context; optional userId prop for public profiles
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
├── PostsContent.jsx              # User's post history list with vote counts and comment counts; optional userId prop for public profiles
├── ReconsiderModal.jsx            # Toxicity reconsider modal with empathy prompt and countdown timer
├── ReportModal.jsx               # Content reporting and moderation modal (isModerating prop switches title/mode)
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
├── CardQueueContent.jsx          # Card queue body extracted from cards.jsx (reused in desktop right panel)
├── DesktopNav.jsx                # Left sidebar navigation for desktop layout (>= 1024px)
├── DesktopRightPanel.jsx         # Right panel container with Cards/Moderation tabs for desktop layout
├── ModerationQueueContent.jsx    # Moderation queue body extracted from moderation.jsx (reused in desktop right panel)
├── Toast.jsx                     # Toast notification system (provider + useToast hook)
├── UserCard.jsx                  # User info card with avatar, name, role badge
├── WysiwygEditor.jsx             # WYSIWYG rich text editor with Visual/Markdown mode toggle (uses useWysiwygVisual hook)
├── GlossaryDrawer.jsx            # Glossary term drawer overlay
├── HighlightedText.jsx           # Text with highlighted term matches
└── TagSelectorModal.jsx          # Reusable tag selector modal with search, multi/single select, and create new
```

# Open questions

Every accepted way of writing a question, one per line, so the Open Questions
view can be checked against a note that exercises the whole parser.

## The canonical form

[oq:: Is the rollout date fixed, or the one we hope for?]

## Bracket and spelling variants

(oq:: Who signs off the budget?)
[[oq::Does the rig need recertifying first?]]
[OQ::   Is the quoted price gross or net?  ]
[openQuestion:: How long does procurement actually take?]
[open-question:: Which team owns the handover?]

## A question in the middle of a sentence

We agreed the scope on Tuesday. [oq:: Did anyone write that down?] The rest of
the paragraph carries on as normal.

## A question naming a note

[oq:: Does [[Simple tasks]] depend on the same rig?]

## Already answered

[oq:: Is there a hard deadline for the pilot?] [resolved:: 2025-01-01]
> [!answer] Yes — the customer demo on 14 February.

## An answer running over several lines

[oq:: Who owns the handover to support?] [resolved:: 2025-01-02]
> [!answer] Ops own it, with engineering on call for the first fortnight.
> Agreed in the 2 January review; revisit once the runbook is written.

## A question whose prose is not an answer

The paragraph under this one must not be mistaken for an answer, because it is
not a callout and does not start on the very next line.

[oq:: Does the rig need recertifying before the pilot?]

Just an ordinary paragraph that happens to follow a question.

## Not questions

These must not show up in the view.

- [ ] A task carrying the marker as metadata [oq:: ignored, this is a task line]
[oq:: ]
[question:: Not the field this plugin reads]
Just an ordinary sentence with no marker at all.

"""Walnut's grounding wall over Stitchwork's stitched sentences (stitch_walnut.walnut.ground)."""
import pytest

from stitch_walnut.walnut import BadRequest, ground

HANDBOOK = ("Cancelled policies are refunded within 14 days of the cancellation date. "
            "Refunds above SGD 5,000 need sign-off from a second claims lead.")
CHAT = "Reminder: we still tell customers 30 days for refunds, until the floor guide changes."


def cites():
    return [
        {"n": 1, "passageId": "wiki:claims-handbook-v2#refunds", "docId": "claims-handbook-v2",
         "kind": "wiki", "sourceName": "Hollowmere Wiki", "text": HANDBOOK},
        {"n": 2, "passageId": "chat:claims-floor#m4", "docId": "claims-floor", "kind": "chat",
         "sourceName": "Hollowmere Chat", "text": CHAT},
    ]


def test_a_quoted_sentence_is_kept_with_its_values_bound_to_its_own_citation():
    r = ground({"sentences": [{"text": "Cancelled policies are refunded within 14 days of the "
                                       "cancellation date.", "citations": [1]}],
                "citations": cites()})
    v = r["sentences"][0]
    assert v["kept"] and v["reasons"] == []
    assert {"value": "14", "tags": ["C1"]} in v["bound"]
    assert r["kept"] == 1 and r["dropped"] == 0


def test_a_value_is_checked_only_against_the_passages_the_sentence_cites():
    # 30 is in passage 2, but this sentence cites only passage 1: it is not evidence for it.
    r = ground({"sentences": [{"text": "Cancelled policies are refunded within 30 days.",
                               "citations": [1]}], "citations": cites()})
    v = r["sentences"][0]
    assert not v["kept"]
    assert "value not in its sources: 30" in v["reasons"]
    assert v["pointers"] == []


def test_a_forged_name_is_dropped():
    r = ground({"sentences": [{"text": "Refunds are approved by Ozymandias Crane.",
                               "citations": [1]}], "citations": cites()})
    assert any("Ozymandias" in reason for reason in r["sentences"][0]["reasons"])


def test_an_identity_assertion_is_dropped():
    r = ground({"sentences": [{"text": "The customer's identity has been verified for refunds "
                                       "within 14 days.", "citations": [1]}],
                "citations": cites()})
    assert any(reason.startswith("asserts an identity") for reason in r["sentences"][0]["reasons"])


def test_a_sentence_that_shares_no_fact_with_its_sources_is_dropped():
    r = ground({"sentences": [{"text": "The moon is made of cheese.", "citations": [1]}],
                "citations": cites()})
    assert r["sentences"][0]["reasons"] == ["binds to no fact in its sources"]


def test_a_sentence_citing_nothing_is_dropped():
    r = ground({"sentences": [{"text": "Cancelled policies are refunded within 14 days.",
                               "citations": [9]}], "citations": cites()})
    assert r["sentences"][0]["reasons"] == ["cites no passage"]


def test_kept_sentences_carry_a_walnut_doc_span_pointer_that_re_resolves_to_the_quote():
    sentence = "Reminder: we still tell customers 30 days for refunds, until the floor guide changes."
    r = ground({"sentences": [{"text": sentence, "citations": [2]}], "citations": cites()})
    (p,) = r["sentences"][0]["pointers"]
    ptr = p["pointer"]
    assert ptr["kind"] == "doc_span" and ptr["document_id"] == "chat:claims-floor#m4"
    assert CHAT[ptr["char_start"]:ptr["char_end"]] == sentence
    assert ptr["trust"] == "untrusted"          # chat is quotable, never trusted


def test_wiki_pointers_are_trusted_and_a_clipped_quote_points_at_its_prefix():
    r = ground({"sentences": [{"text": HANDBOOK[:31] + "...", "citations": [1]}],
                "citations": cites()})
    ptr = r["sentences"][0]["pointers"][0]["pointer"]
    assert ptr["trust"] == "trusted"
    assert HANDBOOK[ptr["char_start"]:ptr["char_end"]] == HANDBOOK[:31]


def test_a_quote_clipped_through_a_number_is_dropped_because_the_stub_is_a_false_value():
    # "within 14" clipped to "within 1..." states a value (1) no source holds.
    clipped = HANDBOOK[:HANDBOOK.index("14") + 1] + "..."
    r = ground({"sentences": [{"text": clipped, "citations": [1]}], "citations": cites()})
    assert r["sentences"][0]["reasons"] == ["value not in its sources: 1"]


def test_a_quote_joined_from_two_sentences_points_at_the_whole_passage():
    first, second = HANDBOOK.split(". ", 1)
    r = ground({"sentences": [{"text": f"{second} {first}.", "citations": [1]}],
                "citations": cites()})
    ptr = r["sentences"][0]["pointers"][0]["pointer"]
    assert (ptr["char_start"], ptr["char_end"]) == (0, len(HANDBOOK))


@pytest.mark.parametrize("body", [
    {}, {"sentences": "x", "citations": []},
    {"sentences": [{"text": 1, "citations": [1]}], "citations": []},
    {"sentences": [], "citations": [{"n": "1", "text": "x"}]},
    {"sentences": [{"text": "a", "citations": [1]}] * 13, "citations": []},
])
def test_malformed_requests_are_refused(body):
    with pytest.raises(BadRequest):
        ground(body)

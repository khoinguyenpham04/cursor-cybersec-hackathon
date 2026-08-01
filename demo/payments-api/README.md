# Demo: acme payments-api (boiling frog)

Sandbox for the supply-chain campaign walkthrough. **Not** product code.

User story: https://github.com/khoinguyenpham04/cursor-cybersec-hackathon/issues/7

Sequence:
1. Add `http-helper` ✅
2. Bump + transitive `quiet-utils` postinstall ✅
3. Expand release workflow permissions / secrets ✅
4. Wire helper into billing sync (this PR)

Composition: install-time execution (PR2) + Actions write/secret (PR3) + first contact with billing tokens (PR4).

# Client Error Handling

All browser and CLI failure messages pass through `src/core/clientErrorMessages.js`. The classifier converts known backend, network, authentication, validation, capacity, provider, parsing, and runtime failures into short staff-facing language.

## Message rules

- Say what failed in ordinary language and include a practical next action when one is known.
- Preserve safe, useful validation text from a `400` response when it does not contain technical internals.
- Include a retry delay for rate limits when the backend supplies one.
- Never use raw command output, paths, stack traces, HTML, JSON payloads, internal error codes, or provider response bodies as the primary message.
- Use a neutral fallback for an unknown failure instead of leaking the original exception.
- Keep useful run diagnostics available in Query History under the collapsed **Technical details for support** section.

`tests/unit/core/clientErrorMessagesLogic.mjs` exercises representative failures across the supported categories. `tests/architecture/plainLanguageClientErrors.mjs` prevents new client code from placing raw exception messages directly into toasts, status text, validation text, or HTML.

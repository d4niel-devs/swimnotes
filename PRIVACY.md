# Privacy and data flow

This statement describes what SwimNotes does with the information typed into it.

## What a user types

Student names, optional class names, the skills they choose for each student, and optional short notes. Student names and the remarks about them are personal information about children, so they are treated that way below.

## What happens to it

- It is processed in the browser's memory to assemble the comment text. **It is not sent anywhere.** The page makes no network requests after it loads, and its Content-Security-Policy forbids them.
- **It is not stored.** There are no cookies, no local storage and no saved drafts. Closing or reloading the page discards everything (the page warns before leaving if there is unsaved work).
- The page has no analytics, tracking, advertising or third-party scripts.

## What leaves the device, and only when the user chooses

- **Copy** puts text on the device's clipboard.
- **Download PDF** saves a file on the device.

Where those files and clipboard contents go afterwards (for example a Downloads folder that syncs to cloud storage, or a pasted email) is outside the application and is up to the user and their organisation's data-handling rules.

## What the website host sees

Like any website, the host (GitHub Pages) can log the request for the page and its files: IP address, browser type and time. None of the names or notes a user types are part of those requests.

## Outside the application's control

Browser features and extensions can handle text typed into any web page: cloud spellcheck, form autofill, browser sync, and grammar or translation tools. Spellcheck and autofill are switched off on the name, class-name and note fields, but extensions cannot be controlled from a web page.

## How to verify this

Open the browser's developer tools, choose the **Network** tab, reload the page, and use the application. Only the site's own files (the page, its script, style and font files) appear, and nothing is sent when comments are generated.

## Scope

This applies to the current version of the application and to releases that do not change the above. If a future release changes how data is handled, this statement will be updated with it.

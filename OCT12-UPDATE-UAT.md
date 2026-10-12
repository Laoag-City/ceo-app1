# 12 October update acceptance tests

Restart the Permit and Queue servers in your existing terminals, then press
Ctrl+F5. These changes require no database migration or data import.

1. **Session notice:** Sign in using account A in browser 1, then sign in using
   account A in browser 2. Browser 1 should show the replacement notice once.
   Click **Go to sign in**. Revisit `localhost:3000` and refresh the login page:
   the old notice should not return. Browser 2 must remain signed in. Repeat
   through Queue's workstation page. Ordinary expiry must still ask for sign-in.
2. **Delete cancellation:** Upload a disposable video as an operator. Click
   **Delete**, check its filename, then Cancel or press Escape. The row and
   monitor playback should remain. A disabled or unavailable clip should also
   have a Delete button.
3. **Delete confirmation:** Delete that disposable video. Its row should disappear,
   Refresh should not restore it, and the monitor should advance to a remaining
   enabled clip. Deleting the last clip should show the normal empty-video state.
   Admin and superadmin have the same control; signed-out visitors cannot delete.
4. **Playlist regression:** Upload, Preview, Up/Down, Enable/Disable and monitor
   playback should still work. Other videos retain their relative order after
   deletion. A storage cleanup warning means the playlist removal succeeded but
   an administrator must remove the leftover stored asset manually.
5. **Portal:** Open `/portal.html` on both systems. The welcome banner is gone;
   both service cards start beneath the office header. Check light/dark mode,
   a narrow browser window, both system links and Refresh status.

The test deployment receives the same published code and the previously tested
security fixes. Existing Neon records and Cloudinary videos are retained during
redeployment. Deleting a video is permanent; use a disposable clip for UAT.

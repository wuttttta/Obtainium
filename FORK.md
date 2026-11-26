# Obtainium Push (personal fork)

This fork is official [Obtainium](https://github.com/ImranR98/Obtainium) plus one
optional feature: **push-triggered update checks**. When one of your repos publishes a
release, a push message tells this Obtainium to check and update only that app, right
away, using its normal background install path. Periodic checks for all other apps keep
working as usual. The feature is off by default (Settings → Updates →
*Push-triggered update checks*). How it works is documented in
[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md#push-triggered-update-checks-servicespush_triggerdart).

## Branches

- `main` is kept identical to `upstream/main` (ImranR98/Obtainium). Never commit to it.
- `push` (the default branch) is `main` plus the feature, this file and the workflow.

## Automatic updates

`.github/workflows/push-fork.yml` runs daily (and on demand from the Actions tab):

1. fast-forwards `main` to `upstream/main`;
2. merges `main` into `push`. Translation files and `pubspec.lock` are merged key by key
   (`tool/fork_merge_driver.mjs`, enabled through `.gitattributes`), so upstream edits next
   to the fork's entries do not conflict. On a real conflict the run fails and GitHub emails
   you; merge `upstream/main` into `push` locally, resolve, and push;
3. if the app itself changed since the last release (or the run
   was started with *force*), it runs the formatter, analyzer and unit tests, builds a
   signed release APK and publishes it as a GitHub Release;
4. if the `OBTAINIUM_PUSH_URL` secret is set, it sends this repo's URL to that endpoint so
   the phone updates Obtainium Push itself.

Pushes to `push` run the same checks and an unsigned build, without releasing.

The APK in every release is called `obtainium-push.apk`, so
https://github.com/wuttttta/Obtainium/releases/latest/download/obtainium-push.apk always
downloads the newest one (the button at the top of the README). The README merge keeps that
button on top of upstream's text.

Releases are named `<upstream version>-push.<n>` (for example `1.7.4-push.1`). The APK
uses the same version name, and version code `<upstream code> × 100 + n`. The build uses
the app ID `dev.imranr.obtainium.push` and the label "Obtainium Push", so it installs next
to the official app. Both are applied at build time by the workflow; the source keeps
upstream's values.

### Repository secrets

| Secret | Value |
| --- | --- |
| `KEYSTORE_BASE64` | The release keystore (PKCS#12), base64-encoded on one line |
| `KEYSTORE_PASSWORD` | Its password (also the key password; key alias `obtainium-push`) |
| `SYNC_DEPLOY_KEY` | Private key (OpenSSH) of a deploy key on this repo with write access. The sync pushes `main` and `push` with it, because upstream commits can change workflow files, which the built-in token may not push. |
| `OBTAINIUM_PUSH_URL` | Optional. The push endpoint shown in the app. |

The workflow refuses to publish an APK that is not signed by the expected certificate
(`SIGNER_SHA256` in the workflow). Keep the keystore safe: Android only accepts updates
signed with the same key, so losing it means uninstalling and reinstalling the app.

## Sending a push from your own repos

1. In the app, turn on *Push-triggered update checks* and copy the endpoint URL.
2. In each repo that publishes APKs, add it as a repository secret named
   `OBTAINIUM_PUSH_URL` (Settings → Secrets and variables → Actions). Treat it as private:
   anyone who has it can make your phone check for updates.
3. Send the message **after the APK is attached to the release**, otherwise the check can
   run before there is anything to install.

The message body can be the repo URL (as below), `owner/repo`, or the app's package ID.
Use the package ID when one repo publishes several apps and you only want to update one.

**Option A (recommended): last step of the workflow that creates the release.**

Give it the same `if:` as the release step. It does nothing while the secret is unset, and
a push failure does not fail the release.

```yaml
      - name: Tell Obtainium about the release
        continue-on-error: true
        env:
          OBTAINIUM_PUSH_URL: ${{ secrets.OBTAINIUM_PUSH_URL }}
        run: |
          [ -n "$OBTAINIUM_PUSH_URL" ] || exit 0
          curl -fsS -d "https://github.com/${{ github.repository }}" "$OBTAINIUM_PUSH_URL"
```

**Option B: a separate workflow** (`.github/workflows/notify-obtainium.yml`). It waits until
the release has an APK. Note that GitHub does not start it for releases that another
workflow created with the default `GITHUB_TOKEN`; use option A in that case.

```yaml
name: Notify Obtainium

on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for an APK on the release
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ github.event.release.tag_name }}
        run: |
          for i in $(seq 1 60); do
            if gh release view "$TAG" -R "${{ github.repository }}" --json assets -q '.assets[].name' | grep -qiE '\.(apk|apks|xapk|apkm)$'; then
              exit 0
            fi
            sleep 10
          done
          echo "No APK after 10 minutes; notifying anyway."
      - name: Notify
        env:
          OBTAINIUM_PUSH_URL: ${{ secrets.OBTAINIUM_PUSH_URL }}
        run: curl -fsS -d "https://github.com/${{ github.repository }}" "$OBTAINIUM_PUSH_URL"
```

To test without a release: `curl -d "owner/repo" "<endpoint>"`, then look at Obtainium's
logs (Settings → Logs) for `Push trigger` and `BG push task` lines.

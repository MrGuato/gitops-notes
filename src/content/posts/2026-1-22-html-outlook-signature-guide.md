---
title: "Outlook HTML Email Signature Guide (Enterprise‑Safe)"
date: 2026-01-22
description: "How to build a professional, Outlook-compatible HTML signature for enterprise environments."
tags: ["web", "email", "enterprise", "html"]
---

# Outlook HTML Email Signature Guide (Enterprise‑Safe)

This repository shows **how to build a professional, Outlook‑compatible HTML email signature** that works across:

* ✅ Outlook Web (Microsoft 365)
* ✅ Outlook Desktop (Windows & macOS)
* ✅ Outlook Mobile (fallback supported)
* ✅ Gmail / external recipients

This guide is written for **IT professionals, consultants, MSPs, and security engineers** who want a clean, modern signature that does **not break**, **does not trigger security warnings**, and **does not rely on third‑party tools**.

---

## What This Signature Supports

* Outlook‑safe HTML (tables only)
* Hosted images (no attachments)
* Clickable links
* Logos + partner icons
* Certification badges
* Works with GitHub Pages image hosting

> Outlook does **not** support modern HTML/CSS. This guide uses the same layout techniques used by Microsoft and enterprise email templates.

---

## Repository Structure

```
outlook-html-signature/
│
├── assets/
│   ├── logo.png
│   ├── partner-1.png
│   ├── partner-2.png
│   ├── badge-1.png
│   ├── badge-2.png
│   └── badge-3.png
│
├── signature.html
├── README.md
└── index.html
```

---

## Hosting Images with GitHub Pages

GitHub Pages is perfect for email signature assets:

* Free
* HTTPS by default
* Public
* Stable

### Step 1 — Enable GitHub Pages

1. Go to your repository
2. **Settings → Pages**
3. Source:

   * Branch: `main`
   * Folder: `/root`
4. Save

Your site will be available at:

```
https://yourusername.github.io/outlook-html-signature/
```

Your images will be accessible at:

```
https://yourusername.github.io/outlook-html-signature/assets/logo.png
```

✅ These URLs work perfectly in Outlook.

---

## Image Guidelines (Very Important)

| Item       | Recommendation       |
| ---------- | -------------------- |
| Format     | PNG                  |
| Background | Transparent or white |
| Logo width | 120–150px            |
| Badge size | 32–36px              |
| Total size | Under 150 KB         |
| Avoid      | SVG, WEBP            |

Outlook **does not reliably support SVG or WebP**.

---

## Example Signature Layout

```
[ Company Logo ]

[ Partner 1 ] [ Partner 2 ]   |   Name
                               Title
                               Address
                               Phone
                               Email | Website

                               [ Badge ] [ Badge ] [ Badge ]
```

---

## signature.html (Main File)

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0"
  style="border-collapse:collapse; font-family:Arial, Helvetica, sans-serif; color:#111;">
  <tr>

    <!-- LEFT COLUMN -->
    <td style="padding:0 16px 0 0; vertical-align:middle; text-align:center; width:160px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td align="center">
            <img src="https://yourusername.github.io/outlook-html-signature/assets/logo.png"
                 width="130" alt="Company Logo" style="display:block; border:0;" />
          </td>
        </tr>

        <tr><td height="8"></td></tr>

        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:6px;">
                  <img src="https://yourusername.github.io/outlook-html-signature/assets/partner-1.png"
                       width="36" style="display:block;" />
                </td>
                <td>
                  <img src="https://yourusername.github.io/outlook-html-signature/assets/partner-2.png"
                       width="36" style="display:block;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>

    <!-- DIVIDER -->
    <td width="1" bgcolor="#7a7a7a">&nbsp;</td>
    <td width="16">&nbsp;</td>

    <!-- RIGHT COLUMN -->
    <td style="vertical-align:middle;">

      <div style="font-size:16px; font-weight:700;">Alex Example</div>
      <div style="font-size:13px; font-style:italic; color:#444;">Security Consultant</div>

      <div style="font-size:13px; margin-top:10px;">
        123 Main Street<br/>Boston, MA 02101
      </div>

      <div style="font-size:13px; margin-top:6px;">📞 555‑123‑4567</div>

      <div style="font-size:13px; margin-top:6px;">
        alex@examplecompany.com | examplecompany.com
      </div>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
        <tr>
          <td style="padding-right:6px;"><img src="assets/badge-1.png" width="34" /></td>
          <td style="padding-right:6px;"><img src="assets/badge-2.png" width="34" /></td>
          <td><img src="assets/badge-3.png" width="34" /></td>
        </tr>
      </table>

    </td>
  </tr>
</table>
```

---

## How to Install in Outlook

### Outlook Web (Recommended)

1. Open `signature.html` in your browser
2. Select all → Copy
3. Outlook → Settings → Mail → Compose and reply
4. Paste into signature box
5. Save

### Outlook Desktop

* Usually syncs automatically
* If not: paste manually under **File → Options → Mail → Signatures**

### Outlook Mobile

Mobile apps do not support full HTML.

Use a short text version:

```
Alex Example
Security Consultant
examplecompany.com
```

---

## Security & Deliverability Best Practices

* Use HTTPS only
* Host images on your own GitHub Pages or company domain
* Avoid link shorteners
* Avoid tracking pixels
* Ensure SPF / DKIM / DMARC are configured

This prevents phishing warnings and "unsafe content" banners.

---

## Why This Works

* Uses tables (Outlook rendering engine requirement)
* Avoids unsupported CSS
* No JavaScript
* No external fonts
* Compatible with Exchange Online

This is the same layout strategy used by banks, MSPs, and enterprise vendors.

---

## Recommended Enhancements

* Create a short reply/forward version
* Add a legal disclaimer footer
* Host images on your company domain later

---

## License

MIT — free to use, modify, and adapt.

---

## 🙌 Credits

Built as a practical guide for IT professionals who want email signatures that actually work.

If this helped you, feel free to ⭐ the repo and share it with others.

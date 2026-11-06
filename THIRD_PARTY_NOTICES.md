# Third-party notices

Project source: AGPL-3.0-or-later. This repository publishes the independent application source. Binary downloads are not included in this source release.

|Component|License / upstream|Use|
|---|---|---|
|PyMuPDF/MuPDF|AGPL-3.0 or commercial — https://github.com/pymupdf/PyMuPDF|PDF rendering/editing and bundled fonts|
|RapidOCR (onnxruntime)|Apache-2.0 — https://github.com/RapidAI/RapidOCR|Local OCR (replaces macOS Apple Vision); PP-OCR models|
|onnxruntime|MIT — https://github.com/microsoft/onnxruntime|OCR inference runtime (ships Windows/macOS/Linux binaries)|
|React / React DOM|MIT — https://github.com/facebook/react|UI|
|i18next / react-i18next|MIT — https://github.com/i18next/i18next|Localization|
|Lucide|ISC — https://github.com/lucide-icons/lucide|Independent open-source icons|
|Electron|MIT plus bundled Chromium/Node notices — https://github.com/electron/electron|Desktop runtime|
|Pillow|HPND — https://github.com/python-pillow/Pillow|Image processing|
|python-docx / python-pptx|MIT — https://github.com/python-openxml|Office exports|
|openpyxl / XlsxWriter|MIT / BSD-2-Clause — https://openpyxl.readthedocs.io / https://github.com/jmcnamara/XlsxWriter|Spreadsheet export|
|lxml|BSD — https://lxml.de|XML dependency|
|pypdf|BSD-3-Clause — https://github.com/py-pdf/pypdf|Independent test reader|
|PyInstaller|GPL with bootloader distribution exception — https://pyinstaller.org|Local engine packaging|
|shapely|BSD-3-Clause — https://github.com/shapely/shapely|OCR geometry (RapidOCR dependency)|
|opencv-python-headless|Apache-2.0 — https://github.com/opencv/opencv-python|OCR image preprocessing (RapidOCR dependency)|

Selected installed license files retained in docs/third-party-licenses. Electron distribution includes LICENSE and LICENSES.chromium.html. Full transitive audit remains a release gate for public redistribution; repository metadata alone is not a license determination. All WPS research evidence is excluded from the packaged application. No WPS assets or binaries are linked/copied. This project is an independent implementation with no affiliation to or endorsement by WPS / Kingsoft.

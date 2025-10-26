Poly_Golly

A toolkit to convert policy documents into structured Markdown, segment them into chunks, and generate a term-based glossary using LLM-assisted semantic matching.

Setup

Prerequisites

•	Python: 3.11 recommended

•	Node.js: 18 (includes npm)

•	Optional: Git

Install Python (Windows)

•	Download and install from: https://www.python.org/downloads/

•	During install, check “Add Python to PATH.”

Verify in powershell:

python --version

pip --version

Install Node.js (Windows)

•	Download and install from: https://nodejs.org/

•	Choose the LTS version.

Verify in powershell:

node --version

npm --version

Python Environment and Dependencies

•	Create and activate a virtual environment:

powershell

python -m venv .venv

. .\.venv\Scripts\Activate.ps1

•	Install Python dependencies:

powershell

pip install --upgrade pip

pip install -r requirements.txt

Node.js Dependencies

•	From the Node project folder (e.g., the app/ui directory if present), install:

npm install

Environment Variables (LLM API key)

•	As the project requires the use of Gemini API, please create an API key by following the steps here: https://geminiforwork.gwaddons.com/setup-api-keys/create-geminiai-api-key/ 

•	Then, edit the .env file within the Backend folder with your key.

Running the Application

•	If you have a virtual environment for python, make sure it is activated.

•	Start the backend (Python):

powershell

cd Backend

py backend.py

•	Start the frontend (Node):

powershell

cd Frontend

npm run

•	Open the local URL printed by the frontend to access the app (typically http://localhost:3000/).

Glossary Generation Workflow

Below is a concise, step-by-step guide to generate the glossary.

1) Document Acquisition and Heading Identification

•	Click “Convert to Markdown”

•	Upload AD: Provide the Document to be analysed (HTML or PDF).

•	Mark headings (recommended):

•	Specify recurring structural headings (e.g., chapters, articles, annexes) and heading levels based on the prompt.

•	Auto-detect (fallback):

•	The app can infer headings automatically, but manual identification is more reliable.

2) User Verification and Refinement (Optional but Recommended)

•	Review the Markdown:

•	Confirm heading tags and document structure are correct.

•	Fix any mismatches before proceeding.

3) Chunking Parameter Input

•	Click “Chunk”

•	Re-upload the Markdown and choose the heading level to segment on. This level determines glossary focus (e.g., segment by articles rather than chapters).

Segmentation behaviour:

Content before the first chosen heading level becomes a “preface” chunk.

All annexes are split into their own chunks.

Output:

The app packages the chunks into a zipped folder.

4) Keyword Dictionary Setup

•	Create a dictionary file (.xlsx or .csv):

Columns: term, short_definition (~20 words often works well).

Choose terms relevant to your intended glossary scope.

Use the provided example file “terms_definitions_example” for reference

•	Click “Manage definitions”

•	Upload the definition file:

•	Directly upload your file to the app.

5) Glossary Generation

•	Click “Manage glossaries” and then “Build glossary” to create a new glossary, or “View glossary” to view one created previously.

•	Similarity matching:

For each chunk, the app pairs it with each term and queries the LLM.

The LLM returns a score representing semantic presence of the concept.

•	Output:
Records all matches as (chunk, keyword, score). A chunk may match with multiple keywords.

•	Threshold in created glossary (optional):

Apply a [0–1] cutoff to filter weak matches.



Usage Summary

•	Prepare: Install Python/Node, set up venv, install dependencies, set .env

•	Run: Start backend and frontend.

•	Process:

•	Upload AD → convert to Markdown → verify and re-upload → choose chunk level → download chunk zip.

•	Dictionary:

•	Create .xlsx/.csv with terms and brief definitions → upload.

•	Generate glossary:

•	Run glossary builder → export matches with scores → optionally filter by threshold.

Troubleshooting

•	Python not found: Reinstall Python and check “Add to PATH.” Restart terminal.

•	Node build errors: Remove node_modules and reinstall:

powershell

rmdir /s /q node_modules

npm install


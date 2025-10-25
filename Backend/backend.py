import os
import google.generativeai as genai
import pandas as pd
import warnings
import json
from markitdown import MarkItDown
from docling.document_converter import DocumentConverter
import io
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import tempfile
import zipfile
import csv
import time

# Suppress specific warnings
warnings.filterwarnings("ignore", message="The value of the smallest subnormal*")
warnings.filterwarnings("ignore", message="Couldn't find ffmpeg or avconv - defaulting to ffmpeg, but may not work")

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Create output directory if it doesn't exist
OUTPUT_DIR = 'converted_files'
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# =====================
# CONFIGURATION SECTION
# =====================
# Load secrets from environment variables
# Ensure these environment variables are set before running this script:
#   GEMINI_API_KEY
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise EnvironmentError("Please set GEMINI_API_KEY as environment variable.")

# Initialize Gemini
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash', generation_config={"temperature": 0})

def check_term_implication(text, term, definition):
    """Checks the degree of implication of a term or its semantic variants in the text using Gemini."""
    prompt = f"""Given the following text:
"{text}"

And the following term and its definition:
Term: "{term}"
Definition: "{definition}"

To what extent is the concept described by the term (or a semantic variant of it) implied in the text? 
Provide a score between 0.000 and 1.000, where 0.000 means the concept is not present at all, and 1.000 means the concept is explicitly and strongly present. 
Only output the score as a floating-point number."""
    try:
        response = model.generate_content(prompt)
        if response.text:
            try:
                score = float(response.text.strip())
                return max(0.0, min(1.0, score))  # Ensure score is within [0, 1]
            except ValueError:
                print(f"Warning: Gemini returned non-numeric response for term '{term}': '{response.text}'. Defaulting to 0.000.")
                return 0.000
        else:
            return 0.000
    except Exception as e:
        print(f"Error during Gemini API call for term '{term}': {e}")
        return 0.000

def process_text_chunk(text, terms_dict):
    """Identifies key terms and their implication scores in a text chunk using Gemini."""
    found_terms = {}
    for term, definition in terms_dict.items():
        score = check_term_implication(text, term, definition)
        if score > 0:
            found_terms[term] = f"{score:.3f}"
    return "; ".join([f"{term}||{score}" for term, score in found_terms.items()])

@app.route('/convert-to-markdown', methods=['POST'])
def convert_to_markdown():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files['file']
        if not file:
            return jsonify({"error": "No file selected"}), 400

        # Determine file type
        filename = file.filename
        file_extension = os.path.splitext(filename)[1].lower()

        # Create a binary buffer from the uploaded file
        file_buffer = io.BytesIO(file.read())

        if file_extension == '.html':
            # Initialize MarkItDown
            md = MarkItDown()
            # Convert file to markdown - only pass the buffer
            result = md.convert_stream(file_buffer)
            markdown_text = result.text_content
        elif file_extension == '.pdf':
            # Use docling for PDF conversion
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                temp_file.write(file_buffer.read())
                temp_file_path = temp_file.name
            
            converter = DocumentConverter()
            # Convert the temporary file to a DoclingDocument
            result = converter.convert(temp_file_path)
            # Export the document to Markdown
            markdown_text = result.document.export_to_markdown()
            
            # Split the markdown text into lines
            lines = markdown_text.split('\n')
            for i, line in enumerate(lines):
                # Check if the line is a heading
                if line.startswith('#'):
                    # Remove leading '#' characters
                    stripped_line = line.lstrip('#').strip()
                    # Check if the line starts with a number or 'Annex'
                    if 'annex' in stripped_line.lower():
                        # Preserve lines containing 'Annex' with their heading markers
                        lines[i] = line
                    elif stripped_line and stripped_line[0].isdigit():
                        # Check if the first letter after the heading number is capitalized
                        parts = stripped_line.split(' ', 1)
                        if len(parts) > 1 and parts[1][:3].lstrip().startswith(parts[1][:3].lstrip()[0].upper()):
                            # Determine the number of '#' based on the number of number sets
                            heading_number = parts[0]
                            number_sets = [s for s in heading_number.split('.') if s.isdigit()]
                            num_hashes = len(number_sets)
                            lines[i] = '#' * num_hashes + ' ' + stripped_line
                        else:
                            # Not a valid heading, remove '#' characters
                            lines[i] = stripped_line
                    else:
                        # Not a valid heading, remove '#' characters
                        lines[i] = stripped_line
            
            # Join the lines back into a single string
            markdown_text = '\n'.join(lines)
        else:
            return jsonify({"error": "Unsupported file type"}), 400

        # Get heading map from request
        heading_map = request.form.get('headingMap', '{}')
        heading_map = json.loads(heading_map)

        # Apply heading mapping if any
        if heading_map:
            lines = markdown_text.split('\n')
            mapped_lines = []
            for line in lines:
                line = line.strip()
                if line:
                    matched = False
                    for prefix, level in heading_map.items():
                        if line.lower().startswith(prefix.lower()):
                            mapped_lines.append('#' * int(level) + ' ' + line)
                            matched = True
                            break
                    if not matched:
                        mapped_lines.append(line)
                mapped_lines.append('')  # Add empty line for readability
            markdown_text = '\n'.join(mapped_lines)

        # Generate output filename
        original_filename = os.path.splitext(file.filename)[0]
        output_filename = f"{original_filename}.md"

        return jsonify({
            "markdown": markdown_text,
            "filename": output_filename,
            # "filepath": output_path  # Remove file path from response
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        file_path = os.path.join(OUTPUT_DIR, filename)
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/process-glossary', methods=['POST'])
def process_glossary():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    temp_file = None
    try:
        # Create a temporary file to store the upload
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1])
        file.save(temp_file.name)
        temp_file.close()  # Close the file before reading with pandas
        
        # Read the file based on its extension
        if file.filename.endswith('.csv'):
            df = pd.read_csv(temp_file.name)
        elif file.filename.endswith('.xlsx'):
            df = pd.read_excel(temp_file.name)
        else:
            return jsonify({'error': 'Unsupported file format. Please upload a CSV or XLSX file.'}), 400

        # Convert DataFrame to list of lists for JSON serialization
        headers = df.columns.tolist()
        
        # Convert all values to strings and handle NaN values
        rows = []
        for _, row in df.iterrows():
            processed_row = []
            for value in row:
                if pd.isna(value):
                    processed_row.append("")
                else:
                    processed_row.append(str(value))
            rows.append(processed_row)

        # Clean up the temporary file
        try:
            os.unlink(temp_file.name)
        except Exception as e:
            print(f"Warning: Could not delete temporary file: {e}")

        return jsonify({
            'headers': headers,
            'rows': rows
        })

    except Exception as e:
        # Clean up the temporary file in case of error
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as cleanup_error:
                print(f"Warning: Could not delete temporary file: {cleanup_error}")
        return jsonify({'error': str(e)}), 500

@app.route('/build-glossary', methods=['POST'])
def build_glossary():
    if 'zip_file' not in request.files or 'definitions_file' not in request.files:
        return jsonify({'error': 'Both zip file and definitions file are required'}), 400
    
    zip_file = request.files['zip_file']
    definitions_file = request.files['definitions_file']
    
    if zip_file.filename == '' or definitions_file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    temp_zip = None
    temp_def = None
    try:
        # Create temporary files
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        temp_def = tempfile.NamedTemporaryFile(delete=False, suffix='.csv')
        
        zip_file.save(temp_zip.name)
        definitions_file.save(temp_def.name)
        
        # Close the files before reading
        temp_zip.close()
        temp_def.close()
        
        # Read definitions
        terms_dict = {}
        with open(temp_def.name, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                term = row['Sub-term'].strip()
                definition = row['Definition'].strip()
                terms_dict[term] = definition

        # Process zip file
        results = []
        with zipfile.ZipFile(temp_zip.name, 'r') as zf:
            md_files = [f for f in zf.namelist() if f.endswith('.md')]
            for filename in md_files:
                try:
                    with zf.open(filename) as md_file:
                        text = md_file.read().decode('utf-8', errors='ignore')
                        key_terms = process_text_chunk(text, terms_dict)
                        results.append({
                            "chunk_info": filename,
                            "chunk_text": text,
                            "key_terms": key_terms
                        })
                        print(f"Processed: {filename} - Found terms: {key_terms}")
                        time.sleep(5)  # Wait for 5 seconds between API calls
                except Exception as e:
                    print(f"Error processing {filename}: {e}")
                    continue

        # Create output Excel file with timestamp
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        output_filename = f'glossary_results_{timestamp}.xlsx'
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        df = pd.DataFrame(results)
        df.to_excel(output_path, index=False)

        return jsonify({
            'message': 'Glossary built successfully',
            'results': results,
            'output_file': output_filename
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up temporary files
        try:
            if temp_zip and os.path.exists(temp_zip.name):
                os.unlink(temp_zip.name)
            if temp_def and os.path.exists(temp_def.name):
                os.unlink(temp_def.name)
        except Exception as cleanup_error:
            print(f"Warning: Could not delete temporary file: {cleanup_error}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

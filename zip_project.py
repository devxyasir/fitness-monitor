import os
import zipfile

source_dir = r"c:\Users\jamya\Desktop\Fitness Platform\replaycoach"
output_zip = r"c:\Users\jamya\Desktop\Fitness Platform\replaycoach_code.zip"

exclude_folders = {
    'node_modules',
    'venv',
    '.git',
    '.turbo',
    'dist',
    '.next',
    '__pycache__',
    'build',
    'out'
}

exclude_extensions = {
    '.zip',
    '.tar.gz',
    '.tgz',
    '.tsbuildinfo'
}

def should_exclude(path):
    parts = os.path.normpath(path).split(os.sep)
    for p in parts:
        if p in exclude_folders:
            return True
    _, ext = os.path.splitext(path)
    if ext.lower() in exclude_extensions:
        return True
    return False

print(f"Zipping started...")
count = 0
try:
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = [d for d in dirs if d not in exclude_folders]
            
            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, os.path.dirname(source_dir))
                
                if should_exclude(rel_path):
                    continue
                    
                zip_file.write(file_path, rel_path)
                count += 1
    print(f"SUCCESS: Zipped {count} files into {output_zip}")
except Exception as e:
    print(f"ERROR: {str(e)}")

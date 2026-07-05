import os
import urllib.request
from pathlib import Path
from ultralytics import YOLO

# Define base paths
BASE_DIR = Path("c:/Users/jamya/Desktop/Fitness Platform")
MODELS_DIR = BASE_DIR / "replaycoach" / "apps" / "pose-service" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

def download_file(url: str, output_path: Path):
    print(f"Downloading {url} to {output_path}...")
    try:
        urllib.request.urlretrieve(url, str(output_path))
        print("Download complete!")
    except Exception as e:
        print(f"Failed to download: {e}")
        raise e

def main():
    # 1. Download RTMPose ONNX Model directly
    rtm_onnx_url = "https://mmdeploy-oss.openmmlab.com/model/mmpose/rtmpose-s-d976b6.onnx"
    rtm_dest = MODELS_DIR / "rtmpose.onnx"
    if not rtm_dest.exists():
        download_file(rtm_onnx_url, rtm_dest)
    else:
        print("rtmpose.onnx already exists. Skipping.")

    # 2. Download and Export YOLOv11s-Pose Model
    yolo_pt_url = "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s-pose.pt"
    yolo_pt_path = BASE_DIR / "yolo11s-pose.pt"
    yolo_onnx_dest = MODELS_DIR / "yolo11s-pose.onnx"

    if not yolo_onnx_dest.exists():
        # Download pt file if not present
        if not yolo_pt_path.exists():
            download_file(yolo_pt_url, yolo_pt_path)
        
        print("Exporting yolo11s-pose.pt to ONNX format...")
        model = YOLO(str(yolo_pt_path))
        # Export produces yolo11s-pose.onnx in the same folder as the pt file
        produced_onnx = model.export(format="onnx")
        
        # Move to models folder
        if os.path.exists(produced_onnx):
            os.replace(produced_onnx, str(yolo_onnx_dest))
            print(f"Successfully moved exported ONNX model to {yolo_onnx_dest}")
        else:
            print("Warning: Export did not produce output at expected location.")
        
        # Clean up temporary .pt weight
        if yolo_pt_path.exists():
            yolo_pt_path.unlink()
            print("Cleaned up yolo11s-pose.pt file.")
    else:
        print("yolo11s-pose.onnx already exists. Skipping.")

    print("\nAll tasks finished. ONNX models are prepared in apps/pose-service/models/")

if __name__ == "__main__":
    main()

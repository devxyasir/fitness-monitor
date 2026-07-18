#!/bin/bash
cd /home/ubuntu/fitness-monitor/replaycoach/apps/pose-service
source venv/bin/activate
exec python export_worker.py

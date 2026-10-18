import sys
from pathlib import Path

# Let the tests import the pipeline package (pipeline/datapipe).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

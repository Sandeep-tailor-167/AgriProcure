# Synthetic development data

Run `python -m ai.training.generate_synthetic --seed 42`. The generator models seasonal and weekly demand, centre/crop effects, no-shows, queue position, counters, service rates, and interruptions. These assumptions validate the pipeline only. Generated CSV files are ignored by Git and their scores must never be presented as real-world accuracy.

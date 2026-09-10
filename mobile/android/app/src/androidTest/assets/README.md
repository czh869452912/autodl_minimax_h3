# High 10 test fixture

`high10-test.mp4` is a one-second synthetic testsrc2 pattern, with no user media or audio. Generated with:

```sh
ffmpeg -f lavfi -i testsrc2=size=64x64:rate=6 -t 1 -c:v libx264 -pix_fmt yuv420p10le -profile:v high10 -movflags +faststart high10-test.mp4
```

The instrumentation test checks that an unsupported High 10 stream is classified separately from corrupt NAL/sample framing. It also permits successful decoding on devices which support this profile.

`unified-high10-test.mp4` is an eight-second synthetic moving pattern with a sine-wave audio track for unified Media3/libmpv playback, seek, EOF and lifecycle verification:

```sh
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 8 -c:v libx264 -pix_fmt yuv420p10le -profile:v high10 -c:a aac -movflags +faststart unified-high10-test.mp4
```

`unified-tracks-test.mp4` copies that video and adds a second 880 Hz sine track (Chinese language tag) and a mov_text subtitle reading “Unified playback subtitle” from 0 to 7.9 seconds. The first audio track and subtitle are tagged English. This checks Media3 audio/subtitle selection backed by mpv; all media is synthetic.

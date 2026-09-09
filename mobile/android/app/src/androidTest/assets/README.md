# High 10 test fixture

`high10-test.mp4` is a one-second synthetic testsrc2 pattern, with no user media or audio. Generated with:

```sh
ffmpeg -f lavfi -i testsrc2=size=64x64:rate=6 -t 1 -c:v libx264 -pix_fmt yuv420p10le -profile:v high10 -movflags +faststart high10-test.mp4
```

The instrumentation test checks that an unsupported High 10 stream is classified separately from corrupt NAL/sample framing. It also permits successful decoding on devices which support this profile.

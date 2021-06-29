# JupyterLab UI Testing

JupyterLab UI tests use [Galata](https://github.com/jupyterlab/galata) which is based on [playwright](https://github.com/microsoft/playwright) and [jest](https://github.com/facebook/jest) frameworks. Galata provides a high level API to control and inspect JupyterLab UI programmatically, testing tools and CLI to manage tests and other tasks.

## Adding a new UI test suite

1. Create a new file ending with `.test.ts` in `ui-tests/tests` directory.
2. Make sure you import `describe` and `test` methods from Galata instead of jest, since Galata overrides them to be able to provide additional functionality.

```ts
import { galata, describe, test } from '@jupyterlab/galata';
```

3. Add your test suite with step by step tasks. Galata runs steps in series, so your steps can rely on the state in the previous step. Check [Galata API](https://github.com/jupyterlab/galata/blob/main/packages/galata/src/galata.ts) for available functionality to interact with JupyterLab.
4. When doing visual regression tests, it is important to use reference images that were generated in the same environment. Please read _Reference Image Captures_ section [here](https://github.com/jupyterlab/galata#reference-image-captures) if you are adding visual regression tests.
5. If you added visual regression tests, make sure you tested them locally enough number of times to make sure they do not produce false positives due to async nature of UI actions. Use the following steps to test locally.

```bash
# install the ipykernel pre-release with support for debugging
python -m pip install --pre --upgrade ipykernel

# inside ui-tests directory:

# install dependencies
jlpm install --frozen-lockfile

# launch JupyterLab
#   create empty working directory
mkdir jlab_root
#  launch JupyterLab with test configuration
jlpm run start-jlab

# run UI tests once to create test captures to use as reference images
jlpm run test:create-references

# copy test captures into reference-output directory to use as references
#  delete existing references
rm -rf reference-output/screenshots/*.*
#  set locally generated test output as references
cp test-output/test/screenshots/*.* reference-output/screenshots

# run UI tests locally, repeatedly. make sure no test fails. wait for 10-20 successful repeats
./repeated_test_run.sh
```

touch

6. Once you are done testing locally:

- Revert changes in your `reference-output/screenshots/` directory
- Update [CI script](../.github/workflows/ui-tests.yml) to use `jlpm run test:create-references` instead of `jlpm run test`. Push your test suite files with change to CI script and create a PR. Do not push reference images generated on your local computer.
- Once CI workflow runs for your PR on GitHub, it will generate test artifacts from your test output, named `ui-test-output`. Download it from GitHub Actions page and copy screenshots from test-output directory into `ui-tests/reference-output/screenshots` directory. Make sure the changes are limited your newly added / modified tests.
- Update [CI script](../.github/workflows/ui-tests.yml) to use `jlpm run test` now and push to your PR along with newly generated reference screenshots.

7. If your tests are failing or if you want to debug UI tests, you can use the script `jlpm run test:debug` by specifying the particular test suite(s) in [package.json](package.json) you want to debug. Check [Galata CLI Options](https://github.com/jupyterlab/galata#command-line-options) for list of available command-line options.

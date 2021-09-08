import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import querystring from 'querystring'
// For local dev
// import http from 'http'
import https from 'https'
import { config } from 'dotenv'

// This optional env var must be set in terminal session in order to be used
const relativeProjectFolderPath = process.env
  .ICONOGRAPHY_RELATIVE_PROJECT_FOLDER_PATH
  ? process.env.ICONOGRAPHY_RELATIVE_PROJECT_FOLDER_PATH
  : '/../../../..'
const projectFolderPath = `${__dirname}${relativeProjectFolderPath}`

config({ path: `${projectFolderPath}/.env` })

export interface IconographyResponse {
  success: boolean
  data?: {
    [familySlug: string]: { [iconName: string]: string }
  }
  error?: string
  statusCode: number
}

async function getSVGs(
  secret: string,
  families: string[],
): Promise<IconographyResponse> {
  return new Promise((resolve, reject) => {
    https
      // For local dev
      // http
      .get(
        // For local dev
        `http://localhost:8080/v3/npm/assets/${secret}?${querystring.encode(
          {
            families,
            categories: true,
          },
        )}`,
        {
          headers: { 'Content-Type': 'application/json' },
        },
        (response) => {
          let data = ''

          response.on('data', (chunk) => {
            data += chunk
          })

          response.on('end', () => {
            if (response.statusCode === 504) {
              throw new Error(
                'API is unavailable, please try again later',
              )
            } else if (response.statusCode >= 500) {
              throw new Error(
                'Api error please try again later',
              )
            }
            try {
              resolve({
                ...JSON.parse(data),
                statusCode: response.statusCode,
              })
            } catch (e) {
              throw new Error('Error parsing JSON from request')
            }
          })
        },
      )
      .on('error', (err) => {
        console.error('API error: ' + err.message)
        throw err
      })
  })
}

export async function installIconographyAssets(): Promise<void> {
  try {
    let iconographyConfiguration: { families: string[]; secret: string } = {
      families: null,
      secret: null,
    }

    let envValid = true
    // Try getting variables from env first
    try {
      if (process.env.ICONOGRAPHY_FAMILIES) {
        /*
         Allow both
           ICONOGRAPHY_FAMILIES=["iconography-regular"]
         and
           ICONOGRAPHY_FAMILIES="[\"iconography-regular\"]"
         forms
         */
        const familiesFromEnv = process.env.ICONOGRAPHY_FAMILIES.replace(
          /\\/g,
          '',
        )
        iconographyConfiguration = {
          families: JSON.parse(familiesFromEnv),
          secret: process.env.ICONOGRAPHY_SECRET,
        }
      }
    } catch (e) {
      if (e.name === 'SyntaxError') {
        console.error(
          'Error while reading env vars: ICONOGRAPHY_FAMILIES env var must be proper JSON',
        )
        envValid = false
      } else {
        throw e
      }
    }

    // If env does not have all variables or it's invalid -- check the config file.
    // @deprecated
    if (
      !envValid ||
      !iconographyConfiguration.families ||
      !iconographyConfiguration.secret
    ) {
      console.debug('Reading iconography-config.json config file')
      const url = `${projectFolderPath}/iconography-config.json`
      const file = await readFileSync(url).toString()
      const fileConfiguration = JSON.parse(file)

      // Overwrite only those with values from .iconography-config.json which aren't set in env
      if (!iconographyConfiguration.families) {
        iconographyConfiguration.families = fileConfiguration.families
      }
      if (!iconographyConfiguration.secret) {
        iconographyConfiguration.secret = fileConfiguration.secret
      }
    }

    if (
      !iconographyConfiguration.families ||
      !iconographyConfiguration.families.length
    ) {
      throw new Error(
        'families key must be present and must be filled with names of families, like iconography-regular',
      )
    }
    if (!iconographyConfiguration.secret) {
      throw new Error(
        'secret key must be present and filled with your private iconography secret token',
      )
    }

    console.debug(
      `Installing Iconography assets for ${iconographyConfiguration.families.join(
        ', ',
      )} families`,
    )

    const getSVGsResponse = await getSVGs(
      iconographyConfiguration.secret,
      iconographyConfiguration.families,
    )

    if (getSVGsResponse.success) {
      await Promise.all(
        Object.keys(getSVGsResponse.data).map(async (familySlug) => {
          const family = getSVGsResponse.data[familySlug]
          return Object.keys(family).map(async (imageImportKey) => {
            const svg = family[imageImportKey]

            const [
              categorySlug,
              subcategorySlug,
              iconSlug,
            ] = imageImportKey.split('/')
            if (svg) {
              const folderPath = `${__dirname}/../img/${familySlug}/${categorySlug}/${subcategorySlug}`
              await mkdirSync(folderPath, { recursive: true })
              return writeFileSync(`${folderPath}/${iconSlug}.svg`, svg)
            } else {
              console.error(
                `No SVG data is present for icon ${imageImportKey} of family ${familySlug}, please report this issue to the Iconography team.`,
              )
            }
          })
        }),
      )
    } else {
      let errorMessage = `Got error "${getSVGsResponse.error}"`
      if (getSVGsResponse.statusCode === 401) {
        errorMessage += ` Error code is 401 which means it's most likely related to the auth token which was provided. Please double check its value by following the instructions in the project's README file.`
      }
      throw new Error(errorMessage)
    }

    console.debug('Finished installing Iconography assets.')
  } catch (e) {
    console.log(e.name)
    if (e.code === 'ENOENT') {
      console.error(
        'ICONOGRAPHY_FAMILIES and ICONOGRAPHY_SECRET must be set in your env or .iconography-config.json file must be present in parent folder',
      )
    } else if (e.name === 'SyntaxError') {
      console.error(
        'ICONOGRAPHY_FAMILIES and ICONOGRAPHY_SECRET must be set in your env or .iconography-config.json file must be proper JSON',
      )
    } else {
      console.error(e)
    }
    process.exitCode = 1
  }
}

installIconographyAssets()
